/**
 * Helpers for the document-metabot spec port
 * (e2e/test/scenarios/documents/document-metabot.cy.spec.ts).
 *
 * The document Metabot block's "Run" button calls
 * POST /api/metabot/document/generate-content — a plain JSON endpoint, NOT the
 * SSE /api/metabot/agent-streaming stream the rest of the Metabot family uses —
 * and reads { draft_card, description, error } off the response
 * (MetabotEmbed.tsx handleRunMetabot). So `support/metabot.ts`'s SSE builders /
 * mockMetabotResponse do not apply here; this port mocks the JSON endpoint.
 *
 * Upstream stubs the LLM at the Anthropic wire level (cy.task
 * startMockLlmServer + the llm-anthropic-* settings) and lets the REAL backend
 * run the `document_construct_sql_chart` tool, whose structured-output the
 * endpoint turns into a draft_card (metabase.metabot.api.document/
 * draft-card-from-chart-output). We can't reach an LLM (no key, jar mode), so
 * we mock the endpoint's JSON response directly with the exact draft_card the
 * backend would have produced from that tool call — the faithful,
 * jar-verifiable equivalent, mirroring how metabot.spec.ts mocks its endpoint.
 */
import type { Page } from "@playwright/test";

/** The name the mocked tool call gives the generated chart. */
export const GENERATED_CARD_NAME = "Feature requests mentioned twice";

export type DocumentGenerateContentResponse = {
  draft_card: {
    name: string;
    display: string;
    dataset_query: Record<string, unknown>;
    database_id: number;
    parameters: unknown[];
    visualization_settings: Record<string, unknown>;
  } | null;
  description: string | null;
  error: string | null;
};

/**
 * Build the { draft_card, description, error } the endpoint returns for a
 * `document_construct_sql_chart` tool call — mirrors
 * draft-card-from-chart-output over the tool's structured output (name +
 * viz_settings.chart_type + the native SQL query the tool constructs).
 */
export function buildSqlChartResponse({
  databaseId,
  name,
  description,
  sql,
  chartType,
}: {
  databaseId: number;
  name: string;
  description: string;
  sql: string;
  chartType: string;
}): DocumentGenerateContentResponse {
  return {
    draft_card: {
      name,
      display: chartType,
      dataset_query: {
        database: databaseId,
        type: "native",
        native: { query: sql },
      },
      database_id: databaseId,
      parameters: [],
      visualization_settings: {},
    },
    description,
    error: null,
  };
}

/**
 * Fulfil POST /api/metabot/document/generate-content with a canned JSON body.
 * Re-calling within a test registers a fresh handler that takes precedence
 * (Playwright matches routes most-recent-first).
 */
export async function mockDocumentGenerateContent(
  page: Page,
  response: DocumentGenerateContentResponse,
) {
  await page.route("**/api/metabot/document/generate-content", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    }),
  );
}
