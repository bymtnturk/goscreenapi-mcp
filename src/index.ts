#!/usr/bin/env node
/**
 * GoScreenAPI MCP Server — entry point.
 *
 * Wires up the Model Context Protocol server over stdio so any MCP-compatible
 * AI assistant (Claude Desktop, Cursor, Cline, Windsurf, Continue, etc.) can
 * call GoScreenAPI tools by name. Configuration lives in env vars:
 *
 *   GOSCREENAPI_KEY        — required, your API key from
 *                            https://goscreenapi.com/dashboard/api-keys
 *   GOSCREENAPI_BASE_URL   — optional, defaults to https://goscreenapi.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GoScreenAPIClient } from "./client.js";
import { captureScreenshot, screenshotInputSchema } from "./tools/screenshot.js";
import { getSiteReport, siteReportInputSchema } from "./tools/siteReport.js";
import { checkUptime, uptimeCheckInputSchema } from "./tools/uptimeCheck.js";
import { compareTwo, compareInputSchema } from "./tools/compare.js";
import { renderPdf, pdfInputSchema } from "./tools/pdf.js";
import { batchCapture, batchInputSchema } from "./tools/batch.js";
import { getAccountInfo } from "./tools/me.js";

// ── Bootstrap ─────────────────────────────────────────────────────
const apiKey = process.env.GOSCREENAPI_KEY ?? "";
const baseUrl = process.env.GOSCREENAPI_BASE_URL;

if (!apiKey) {
  console.error(
    "[goscreenapi-mcp] GOSCREENAPI_KEY env var is missing. " +
      "Add it to your MCP server config:\n" +
      '  "env": { "GOSCREENAPI_KEY": "sk_..." }\n' +
      "Get a key at https://goscreenapi.com/dashboard/api-keys"
  );
  process.exit(1);
}

const client = new GoScreenAPIClient({ apiKey, baseUrl });

// ── Tool registry ─────────────────────────────────────────────────
// Each entry pairs an MCP-visible name + description with a Zod input schema
// (used for the JSON Schema we expose to the AI) and a handler.
const tools = [
  {
    name: "screenshot",
    description:
      "Capture a screenshot of any URL. Returns a CDN link to the image. Supports png/jpeg/webp/pdf, custom viewport, full-page, dark mode, ad blocking, and custom user agent.",
    schema: z.object(screenshotInputSchema),
    handler: (args: unknown) => captureScreenshot(client, args as never),
  },
  {
    name: "site_report",
    description:
      "Get a structured report for a domain: detected tech stack (CMS, server, CDN, frameworks, JS libs), SSL certificate info, DNS records, page-speed rating, and SEO meta tags. Use this to research a website's tech profile.",
    schema: z.object(siteReportInputSchema),
    handler: (args: unknown) => getSiteReport(client, args as never),
  },
  {
    name: "uptime_check",
    description:
      "Check if a URL is currently reachable. Performs a live HTTP request and reports status code, response time in ms, and SSL validity. Use to verify whether a site is down before reporting to the user.",
    schema: z.object(uptimeCheckInputSchema),
    handler: (args: unknown) => checkUptime(client, args as never),
  },
  {
    name: "compare_screenshots",
    description:
      "Capture two URLs side by side and return both CDN links. Ideal for comparing staging vs production, competitor pages, or before/after redesigns.",
    schema: z.object(compareInputSchema),
    handler: (args: unknown) => compareTwo(client, args as never),
  },
  {
    name: "render_pdf",
    description:
      "Render any URL to a PDF document. Returns a CDN link. Supports A4/Letter/Legal/Tabloid paper sizes, landscape orientation, and custom scaling.",
    schema: z.object(pdfInputSchema),
    handler: (args: unknown) => renderPdf(client, args as never),
  },
  {
    name: "batch_screenshots",
    description:
      "Capture up to 50 URLs in parallel via the batch API. Waits for completion (up to 90s) and returns all CDN links plus a per-URL status summary.",
    schema: z.object(batchInputSchema),
    handler: (args: unknown) => batchCapture(client, args as never),
  },
  {
    name: "account_info",
    description:
      "Show the current API account: plan name, monthly/daily usage quota, remaining credits. Call this first when planning a large operation.",
    schema: z.object({}),
    handler: () => getAccountInfo(client),
  },
] as const;

// ── MCP server wiring ─────────────────────────────────────────────
const server = new Server(
  { name: "goscreenapi", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// Convert each Zod schema into a JSON Schema object for the AI.
function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
} {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny;
    properties[key] = describeZod(zodType);
    if (!zodType.isOptional()) required.push(key);
  }

  return { type: "object", properties, required };
}

function describeZod(t: z.ZodTypeAny): Record<string, unknown> {
  const description = t.description;
  let inner = t;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
    inner = inner.unwrap();
  }

  if (inner instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: "string" };
    if (description) out.description = description;
    return out;
  }
  if (inner instanceof z.ZodNumber) {
    const out: Record<string, unknown> = { type: "number" };
    if (description) out.description = description;
    return out;
  }
  if (inner instanceof z.ZodBoolean) {
    const out: Record<string, unknown> = { type: "boolean" };
    if (description) out.description = description;
    return out;
  }
  if (inner instanceof z.ZodEnum) {
    const out: Record<string, unknown> = {
      type: "string",
      enum: inner.options,
    };
    if (description) out.description = description;
    return out;
  }
  if (inner instanceof z.ZodArray) {
    const out: Record<string, unknown> = {
      type: "array",
      items: describeZod(inner.element),
    };
    if (description) out.description = description;
    return out;
  }
  // Fallback for anything we don't explicitly handle.
  const out: Record<string, unknown> = { type: "string" };
  if (description) out.description = description;
  return out;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.schema as z.ZodObject<z.ZodRawShape>),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find((t) => t.name === request.params.name);
  if (!tool) {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  try {
    const args = tool.schema.parse(request.params.arguments ?? {});
    return await tool.handler(args);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : "Unknown error";
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `Tool '${tool.name}' failed: ${message}`,
        },
      ],
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);

// stderr is the only safe place to log: stdout is the MCP transport.
console.error("[goscreenapi-mcp] connected — 7 tools registered");
