import { z } from "zod";
import type { GoScreenAPIClient } from "../client.js";
import { captureScreenshot } from "./screenshot.js";

/**
 * Take screenshots of two URLs side-by-side. The AI gets back two CDN links
 * it can render or analyze. Useful for "compare staging vs production",
 * "competitor pricing pages", "before vs after redesign" workflows.
 */
const Schema = z.object({
  url_a: z.string().url().describe("First URL to capture"),
  url_b: z.string().url().describe("Second URL to capture"),
  width: z.number().int().min(320).max(3840).optional().describe("Viewport width (default 1280)"),
  full_page: z.boolean().optional().describe("Capture full page on both (default false)"),
});

export const compareInputSchema = Schema.shape;

export async function compareTwo(
  client: GoScreenAPIClient,
  input: z.infer<typeof Schema>
) {
  const args = Schema.parse(input);

  const [a, b] = await Promise.all([
    captureScreenshot(client, {
      url: args.url_a,
      width: args.width,
      full_page: args.full_page,
    }),
    captureScreenshot(client, {
      url: args.url_b,
      width: args.width,
      full_page: args.full_page,
    }),
  ]);

  return {
    content: [
      { type: "text" as const, text: `Comparison: ${args.url_a} vs ${args.url_b}` },
      ...a.content,
      ...b.content,
    ],
  };
}
