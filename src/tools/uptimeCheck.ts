import { z } from "zod";
import type { GoScreenAPIClient } from "../client.js";

/**
 * Check whether a URL is currently reachable. Performs a live HTTP request
 * and reports status code, response time, SSL validity.
 *
 * Uses the public /api/uptime/check?url= endpoint that powers
 * goscreenapi.com/is-{domain}-down pages.
 */
const Schema = z.object({
  url: z.string().url().describe("Full URL to probe (with https://)"),
});

export const uptimeCheckInputSchema = Schema.shape;

export async function checkUptime(
  client: GoScreenAPIClient,
  input: z.infer<typeof Schema>
) {
  const args = Schema.parse(input);

  // Endpoint signature mirrors the Is-Down public check tool.
  const data = await client.request<{
    url?: string;
    status?: string;
    http_status?: number;
    response_time_ms?: number;
    ssl_valid?: boolean;
    error?: string;
    checked_at?: string;
  }>("GET", "/api/uptime/check", undefined, { url: args.url });

  const lines: string[] = [];
  lines.push(`Uptime check: ${args.url}`);
  if (data.status) {
    const isUp = data.status === "up";
    lines.push(`  Status: ${isUp ? "UP ✓" : "DOWN ✗"}`);
  }
  if (data.http_status) lines.push(`  HTTP: ${data.http_status}`);
  if (data.response_time_ms !== undefined)
    lines.push(`  Response time: ${data.response_time_ms} ms`);
  if (data.ssl_valid !== undefined)
    lines.push(`  SSL: ${data.ssl_valid ? "valid" : "invalid"}`);
  if (data.error) lines.push(`  Error: ${data.error}`);
  if (data.checked_at) lines.push(`  Checked at: ${data.checked_at}`);

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
