
import { z } from "zod";
import type { GoScreenAPIClient } from "../client.js";

/**
 * Capture a screenshot of any URL. Synchronous mode returns the CDN URL
 * directly so the AI can paste it into chat. If the backend falls back to
 * async mode (`status: "queued"`), we poll the status endpoint until the
 * screenshot is ready or the deadline expires.
 *
 * Maps to: POST /api/v1/screenshot, GET /api/v1/screenshot/{request_id}
 */
export const screenshotInputSchema = {
  url: z.string().url().describe("Full URL to capture, including scheme (https://...)"),
  width: z.number().int().min(320).max(3840).optional().describe("Viewport width in pixels (default 1280)"),
  height: z.number().int().min(240).max(2160).optional().describe("Viewport height in pixels (default 800)"),
  format: z.enum(["png", "jpeg", "pdf", "webp"]).optional().describe("Output format (default png)"),
  full_page: z.boolean().optional().describe("Capture full scrollable page instead of viewport (default false)"),
  device_scale_factor: z.number().min(1).max(3).optional().describe("DPI scale (1=normal, 2=retina)"),
  delay: z.number().int().min(0).max(30000).optional().describe("Wait this many ms after page load before capture"),
  dark_mode: z.boolean().optional().describe("Render with prefers-color-scheme: dark"),
  block_ads: z.boolean().optional().describe("Block known ad/tracker domains during render"),
  user_agent: z.string().optional().describe("Custom User-Agent string"),
};

const Schema = z.object(screenshotInputSchema);

interface ScreenshotResponse {
  status?: string;
  image_url?: string;
  request_id?: string;
  poll_url?: string;
  width?: number;
  height?: number;
  format?: string;
  file_size?: number;
}

export async function captureScreenshot(
  client: GoScreenAPIClient,
  input: z.infer<typeof Schema>
) {
  const args = Schema.parse(input);

  const body: Record<string, unknown> = {
    url: args.url,
    width: args.width ?? 1280,
    height: args.height ?? 800,
    format: args.format ?? "png",
    fullPage: args.full_page ?? false,
    deviceScaleFactor: args.device_scale_factor ?? 1,
    sync: true,
  };
  if (args.delay !== undefined) body.delay = args.delay;
  if (args.dark_mode) body.darkMode = true;
  if (args.block_ads) body.blockAds = true;
  if (args.user_agent) body.userAgent = args.user_agent;

  let res = await client.request<ScreenshotResponse>(
    "POST",
    "/api/v1/screenshot",
    body
  );

  // Backend may fall back to async mode even when sync=true. Poll until done.
  if (!res.image_url && res.request_id) {
    res = await pollScreenshot(client, res.request_id);
  }

  if (!res.image_url) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Screenshot request did not complete in time. ` +
            (res.request_id
              ? `Request ID: ${res.request_id}\nPoll later: GET /api/v1/screenshot/${res.request_id}`
              : "") +
            `\n\nFull response: ${JSON.stringify(res, null, 2)}`,
        },
      ],
    };
  }

  const summary = [
    `✓ Screenshot captured: ${args.url}`,
    `  URL: ${res.image_url}`,
    res.width && res.height ? `  Dimensions: ${res.width}×${res.height}` : null,
    res.format ? `  Format: ${res.format}` : null,
    res.file_size ? `  Size: ${formatBytes(res.file_size)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    content: [
      { type: "text" as const, text: summary },
      { type: "text" as const, text: `Direct CDN link: ${res.image_url}` },
    ],
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Poll the screenshot status endpoint until the image is ready, the job
 * fails, or the deadline expires. Returns the last response either way.
 */
async function pollScreenshot(
  client: GoScreenAPIClient,
  requestId: string,
  maxWaitMs = 45_000,
  intervalMs = 2_000
): Promise<ScreenshotResponse> {
  const deadline = Date.now() + maxWaitMs;
  let last: ScreenshotResponse = { request_id: requestId };
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const raw = await client.request<{
      status?: string;
      image_url?: string;
      request?: {
        id?: string;
        status?: string;
        image_url?: string;
        width?: number;
        height?: number;
        format?: string;
        file_size?: number;
        error_message?: string;
      };
    }>("GET", `/api/v1/screenshot/${encodeURIComponent(requestId)}`);
    // Normalize: poll endpoint wraps data under "request"; flatten it.
    const job = raw.request ?? {};
    last = {
      status: job.status ?? raw.status,
      image_url: job.image_url ?? raw.image_url,
      request_id: job.id ?? requestId,
      width: job.width,
      height: job.height,
      format: job.format,
      file_size: job.file_size,
    };
    if (last.image_url) return last;
    if (last.status === "failed" || last.status === "error") return last;
  }
  return last;
}
