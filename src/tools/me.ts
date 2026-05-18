import type { GoScreenAPIClient } from "../client.js";

/**
 * Tells the AI about the current API account: usage quota, plan name,
 * remaining credits. Useful before kicking off a large batch.
 */
export async function getAccountInfo(client: GoScreenAPIClient) {
  const data = await client.request<{
    user?: { email?: string; status?: string };
    plan?: { name?: string };
    usage?: {
      monthly_used?: number;
      monthly_limit?: number;
      daily_used?: number;
      daily_limit?: number;
    };
    credits?: number;
  }>("GET", "/api/v1/me");

  const lines: string[] = [];
  lines.push("GoScreenAPI account:");
  if (data.user?.email) lines.push(`  Email: ${data.user.email}`);
  if (data.plan?.name) lines.push(`  Plan: ${data.plan.name}`);
  if (data.usage) {
    if (data.usage.monthly_used !== undefined && data.usage.monthly_limit !== undefined) {
      lines.push(
        `  Monthly: ${data.usage.monthly_used}/${data.usage.monthly_limit} screenshots`
      );
    }
    if (data.usage.daily_used !== undefined && data.usage.daily_limit !== undefined) {
      lines.push(
        `  Today: ${data.usage.daily_used}/${data.usage.daily_limit} screenshots`
      );
    }
  }
  if (data.credits !== undefined) lines.push(`  Credits: ${data.credits}`);

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
