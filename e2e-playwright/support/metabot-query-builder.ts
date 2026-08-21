/**
 * Spec-local helpers for tests/metabot-query-builder.spec.ts (port of
 * e2e/test/scenarios/metabot/metabot-query-builder.cy.spec.ts).
 *
 * The shared UI helpers, SSE builders and mockMetabotResponse live in
 * support/metabot.ts and are imported read-only by the spec. This module only
 * carries the canned-response builders and the small waiters that were defined
 * locally in the Cypress spec.
 *
 * The LLM is STUBBED: each test fulfils POST /api/metabot/agent-streaming with a
 * canned SSE body built from the pure builders below. No API key, jar-verifiable.
 */
import type { Page, Response } from "@playwright/test";

import {
  createMetabotSSEBody,
  metabotDataPart,
  metabotErrorPart,
  metabotFinishPart,
  metabotTextPart,
} from "./metabot";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";

const { ORDERS_ID } = SAMPLE_DATABASE;

/** Port of the spec's module-level `allOrdersQuestion`. */
export const allOrdersQuestion = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    query: { "source-table": ORDERS_ID },
    type: "query" as const,
  },
  display: "table",
  visualization_settings: {},
};

export const AGENT_STREAMING_PATH = "/api/metabot/agent-streaming";

/**
 * The Cypress spec waits on the `@metabotAgent` alias set by mockMetabotResponse
 * (its `beforeEach` also aliases the endpoint as `@agentReq`, but nothing ever
 * waits on that — dropped per PORTING rule 2). Register before the triggering
 * action, await after; the returned Response carries the request for body
 * inspection (e.g. `profile_id`).
 */
export function waitForAgentRequest(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname === AGENT_STREAMING_PATH,
  );
}

// --- canned SSE response bodies (ports of the spec's local helpers) ---

/** Port of mockNavigateToResponse. */
export const mockNavigateToResponse = (path: string) =>
  createMetabotSSEBody(metabotDataPart("navigate_to", path));

/** Port of mockTextOnlyResponse. */
export const mockTextOnlyResponse = (text: string) =>
  createMetabotSSEBody(metabotTextPart(text));

/** Port of mockGeneratedEntityResponse. */
export const mockGeneratedEntityResponse = (datasetQuery: unknown) => {
  const value = {
    type: "card",
    id: "card-1",
    title: "All orders",
    query: { id: "query-1", query: datasetQuery },
    display: "table",
  };
  return createMetabotSSEBody(metabotDataPart("generated_entity", value));
};

/** Port of mockErrorResponse. */
export const mockErrorResponse = createMetabotSSEBody(
  metabotErrorPart("Anthropic API key expired or invalid"),
  metabotFinishPart("error"),
);

/**
 * Port of `cy.intercept("GET", "/api/metabot/metabot/*​/prompt-suggestions*", …)`.
 * Playwright globs treat `*` as "not `/`", so match the id segment with a regex.
 */
export async function mockPromptSuggestions(
  page: Page,
  prompts: { prompt: string }[],
) {
  await page.route(
    /\/api\/metabot\/metabot\/[^/]+\/prompt-suggestions/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ prompts }),
      }),
  );
}
