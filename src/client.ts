/**
 * Thin HTTP client for the GoScreenAPI REST API.
 *
 * Auth: every request sends `X-API-Key: <key>` so users can manage credentials
 * via their dashboard at https://goscreenapi.com/dashboard/api-keys.
 *
 * The base URL defaults to https://goscreenapi.com but can be overridden via
 * the GOSCREENAPI_BASE_URL env var (useful for white-label deploys or local dev).
 */

const DEFAULT_BASE_URL = "https://goscreenapi.com";
const DEFAULT_TIMEOUT_MS = 60_000;

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class GoScreenAPIClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: ClientOptions) {
    if (!opts.apiKey || opts.apiKey.trim() === "") {
      throw new Error(
        "GoScreenAPI: missing API key. Set GOSCREENAPI_KEY in your MCP config."
      );
    }
    this.apiKey = opts.apiKey.trim();
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Issue a JSON request against the API. Returns parsed JSON on 2xx,
   * throws a structured Error otherwise (with status, body, url for debugging).
   */
  async request<T = unknown>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "goscreenapi-mcp/0.1.0",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }

      if (!res.ok) {
        throw Object.assign(
          new Error(
            `GoScreenAPI ${method} ${path} failed: HTTP ${res.status}` +
              (typeof parsed === "object" && parsed && "message" in parsed
                ? ` — ${(parsed as { message?: string }).message ?? ""}`
                : "")
          ),
          { status: res.status, body: parsed, url: url.toString() }
        );
      }

      return parsed as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
