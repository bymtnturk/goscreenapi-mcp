
import { z } from "zod";
import type { GoScreenAPIClient } from "../client.js";

/**
 * Render a URL to PDF. Useful for archiving documentation, generating shareable
 * reports, or feeding the PDF into another tool. Returns the CDN URL.
 *
 * Maps to: POST /api/v1/screenshot (format=pdf), GET /api/v1/screenshot/{request_id}
 */
const Schema = z.object({
  url: z.string().url().describe("Full URL to render as PDF"),
  format: z.enum(["A4", "Letter", "Legal", "Tabloid"]).optional().describe("Paper size (default A4)"),
  landscape: z.boolean().optional().describe("Landscape orientation (default false)"),
  print_background: z.boolean().optional().describe("Include background colors/images (default true)"),
  scale: z.number().min(0.1).max(2).optional().describe("Page scale (default 1)"),
});

export const pdfInputSchema = Schema.shape;

interface PdfResponse {
  status?: string;
  image_url?: string;
  request_id?: string;
  poll_url?: string;
  file_size?: number;
}

export async function renderPdf(
  client: GoScreenAPIClient,
  input: z.infer<typeof Schema>
) {
  const args = Schema.parse(input);

  const body: Record<string, unknown> = {
    url: args.url,
    format: "pdf",
    pdfFormat: args.format ?? "A4",
    landscape: args.landscape ?? false,
    printBackground: args.print_background ?? true,
    sync: true,
  };
  if (args.scale !== undefined) body.scale = args.scale;

  let res = await client.request<PdfResponse>(
    "POST",
    "/api/v1/screenshot",
    body
  );

  // Backend may fall back to async mode even when sync=true. Poll until done.
  if (!res.image_url && res.request_id) {
    res = await pollPdf(client, res.request_id);
  }

  if (!res.image_url) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            `PDF generation did not complete in time. ` +
            (res.request_id
              ? `Request ID: ${res.request_id}\nPoll later: GET /api/v1/screenshot/${res.request_id}`
              : "") +
            `\n\nFull response: ${JSON.stringify(res, null, 2)}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `✓ PDF generated for ${args.url}\n  URL: ${res.image_url}${
          res.file_size ? `\n  Size: ${(res.file_size / 1024).toFixed(1)} KB` : ""
        }`,
      },
    ],
  };
}

/**
 * Poll the screenshot status endpoint for a queued PDF render.
 */
async function pollPdf(
  client: GoScreenAPIClient,
  requestId: string,
  maxWaitMs = 45_000,
  intervalMs = 2_000
): Promise<PdfResponse> {
  const deadline = Date.now() + maxWaitMs;
  let last: PdfResponse = { request_id: requestId };
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const raw = await client.request<{
      status?: string;
      image_url?: string;
      request?: {
        id?: string;
        status?: string;
        image_url?: string;
        file_size?: number;
        error_message?: string;
      };
    }>("GET", `/api/v1/screenshot/${encodeURIComponent(requestId)}`);
    const job = raw.request ?? {};
    last = {
      status: job.status ?? raw.status,
      image_url: job.image_url ?? raw.image_url,
      request_id: job.id ?? requestId,
      file_size: job.file_size,
    };
    if (last.image_url) return last;
    if (last.status === "failed" || last.status === "error") return last;
  }
  return last;
}
