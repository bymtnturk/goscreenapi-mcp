import { z } from "zod";
import type { GoScreenAPIClient } from "../client.js";

/**
 * Batch capture: send N URLs, get back N CDN links. Backed by /api/v1/batch.
 *
 * The MCP layer waits for the batch to finish (poll loop) so the AI can use
 * the results in the same conversation turn.
 */
const Schema = z.object({
  urls: z
    .array(z.string().url())
    .min(1)
    .max(50)
    .describe("Up to 50 URLs to capture in parallel"),
  width: z.number().int().min(320).max(3840).optional(),
  full_page: z.boolean().optional(),
});

export const batchInputSchema = Schema.shape;

interface BatchSubmitResponse {
  batch_id: string;
  status: string;
}

interface BatchStatusResponse {
  batch_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  total: number;
  completed: number;
  failed: number;
  items?: Array<{
    url: string;
    status: string;
    image_url?: string;
    error?: string;
  }>;
}

export async function batchCapture(
  client: GoScreenAPIClient,
  input: z.infer<typeof Schema>
) {
  const args = Schema.parse(input);

  // 1. Submit batch
  const submit = await client.request<BatchSubmitResponse>(
    "POST",
    "/api/v1/batch",
    {
      requests: args.urls.map((url) => ({
        url,
        width: args.width ?? 1280,
        height: 800,
        format: "png",
        fullPage: args.full_page ?? false,
      })),
    }
  );

  // 2. Poll for completion. MCP clients typically apply a ~60s tool-call
  //    timeout, so cap the wait at 50s and return a "still running" response
  //    with the batch_id if the job is not done yet. The caller can re-invoke
  //    a follow-up status check.
  const maxWaitMs = 50_000;
  const intervalMs = 3_000;
  const deadline = Date.now() + maxWaitMs;
  let last: BatchStatusResponse | null = null;
  while (Date.now() < deadline) {
    const status = await client.request<BatchStatusResponse>(
      "GET",
      `/api/v1/batch/${encodeURIComponent(submit.batch_id)}`
    );
    last = status;
    if (status.status === "completed" || status.status === "failed") break;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  if (!last) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Batch ${submit.batch_id} submitted but no status returned.`,
        },
      ],
    };
  }

  // Still running after the deadline — surface batch_id so the caller can
  // poll again instead of failing with an MCP timeout.
  if (last.status !== "completed" && last.status !== "failed") {
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Batch ${last.batch_id} still running (${last.completed}/${last.total} completed, ${last.failed} failed).\n` +
            `Check status later: GET /api/v1/batch/${last.batch_id}`,
        },
      ],
    };
  }

  const lines: string[] = [];
  lines.push(`Batch ${last.batch_id} — ${last.status}`);
  lines.push(
    `  ${last.completed}/${last.total} completed, ${last.failed} failed`
  );
  if (last.items) {
    for (const item of last.items) {
      if (item.image_url) {
        lines.push(`  ✓ ${item.url} → ${item.image_url}`);
      } else {
        lines.push(`  ✗ ${item.url} (${item.error ?? item.status})`);
      }
    }
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
