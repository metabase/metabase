/**
 * Helpers for the MCP-analytics port
 * (e2e/test/scenarios/metabot/mcp-analytics.cy.spec.ts).
 *
 * The spec drives the EE "MCP analytics" admin page under the Auditing folder.
 * Tool-call rows are seeded deterministically through the testing API
 * (POST /api/testing/mcp/seed-tool-call), which routes through the production
 * metabase.mcp.usage recording helpers — no external MCP-server infra needed.
 * The page itself queries the EE audit database (id 13371337), which an EE
 * build loads at startup.
 */
import type { Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { ADMIN_USER_ID } from "./metabot-usage-auditing";
import { main } from "./ui";

export const MCP_ANALYTICS_PATH = "/admin/metabot/usage-auditing/mcp";
export const SEED_TOOL_NAME = "e2e_smoke_tool";
export const SEED_ERROR_TOOL = "e2e_error_tool";
// error_code -32602 is JSON-RPC "Invalid params", which the view maps to
// error_type "Invalid params".
export const SEED_ERROR_CODE = -32602;
export const SEED_ERROR_TYPE = "Invalid params";
export const SEED_ERROR_MESSAGE = "missing required argument: query";

export type SeedMcpToolCallResponse = { session_id: string; tool_name: string };

export type SeedMcpToolCallBody = {
  tool_name?: string;
  status?: string;
  error_code?: number;
  error_message?: string;
};

/**
 * Port of the spec-local seedMcpToolCall: POST /api/testing/mcp/seed-tool-call
 * as the current (admin) user, defaulting user_id + tool_name.
 */
export async function seedMcpToolCall(
  api: MetabaseApi,
  body: SeedMcpToolCallBody = {},
): Promise<SeedMcpToolCallResponse> {
  const response = await api.post("/api/testing/mcp/seed-tool-call", {
    user_id: ADMIN_USER_ID,
    tool_name: SEED_TOOL_NAME,
    ...body,
  });
  return (await response.json()) as SeedMcpToolCallResponse;
}

// The Cypress intercept was GET /api/database/13371337/metadata* — the wildcard
// only covers query params, which URL.pathname strips, so an exact pathname
// match is equivalent.
function isAuditMetadataResponse(response: Response): boolean {
  return (
    response.request().method() === "GET" &&
    new URL(response.url()).pathname === "/api/database/13371337/metadata"
  );
}

function isDatasetResponse(response: Response): boolean {
  return (
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/api/dataset"
  );
}

/**
 * Port of the spec-local visitMcpAnalyticsPage: register the audit-metadata
 * wait BEFORE navigating (PORTING rule 2), then await it. The never-awaited
 * "@dataset" intercept the Cypress helper also registered is folded into
 * openToolCallsTab, where the dataset query is actually triggered.
 */
export async function visitMcpAnalyticsPage(page: Page): Promise<void> {
  const auditMetadata = page.waitForResponse(isAuditMetadataResponse);
  await page.goto(MCP_ANALYTICS_PATH);
  await auditMetadata;
}

/**
 * Click the "Tool calls" tab and wait for the events-table dataset query.
 * Cypress registered "@dataset" at visit time and cy.wait'd it after the click;
 * Playwright must register the wait before the triggering click.
 */
export async function openToolCallsTab(page: Page): Promise<void> {
  const dataset = page.waitForResponse(isDatasetResponse);
  await main(page)
    .getByRole("tab", { name: "Tool calls", exact: true })
    .click();
  await dataset;
}
