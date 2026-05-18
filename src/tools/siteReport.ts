import { z } from "zod";
import type { GoScreenAPIClient } from "../client.js";

/**
 * Fetch the public site report for a domain (tech stack, SSL, DNS, speed, meta).
 *
 * GoScreenAPI publishes /site-report/{domain} as an HTML page; we hit the same
 * controller by appending ?format=json which returns the structured data.
 */
const Schema = z.object({
  domain: z
    .string()
    .min(3)
    .describe("Domain name without scheme, e.g. 'github.com'. Strips https:// if provided."),
});

export const siteReportInputSchema = Schema.shape;

export async function getSiteReport(
  client: GoScreenAPIClient,
  input: z.infer<typeof Schema>
) {
  const args = Schema.parse(input);
  const domain = normalizeDomain(args.domain);

  const data = await client.request<Record<string, unknown>>(
    "GET",
    `/site-report/${encodeURIComponent(domain)}`,
    undefined,
    { format: "json" }
  );

  return {
    content: [
      {
        type: "text" as const,
        text: `Site report for ${domain}:\n\n${JSON.stringify(data, null, 2)}`,
      },
    ],
  };
}

function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.replace(/^www\./, "");
  d = d.split("/")[0];
  d = d.split("?")[0];
  return d;
}
