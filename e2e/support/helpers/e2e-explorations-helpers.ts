import type { StaticResponse } from "cypress/types/net-stubbing";

import { updateSetting } from "./api";
import { activateToken } from "./e2e-token-helpers";

const MOCK_LLM_PORT = 6125;
const MOCK_LLM_RESPONSE = "Hello from Explorations!";

export function enableExplorations(): void {
  activateToken("pro-self-hosted");
  updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
  updateSetting("metabot-enabled?", true);
  cy.task("startMockLlmServer", {
    port: MOCK_LLM_PORT,
    responseText: MOCK_LLM_RESPONSE,
  });
  updateSetting(
    "llm-anthropic-api-base-url",
    `http://localhost:${MOCK_LLM_PORT}`,
  );
}

export function explorationsMetabotPromptInput(): Cypress.Chainable<
  JQuery<HTMLElement>
> {
  return cy.get(".ProseMirror[contenteditable=true]");
}

export function visitNewExploration(): void {
  cy.visit("/question/research");
  cy.findByRole("button", { name: /Manual setup/i }).should("be.visible");
}

/**
 * Enter the manual data-picking flow from the entry page.
 */
export function startManualExploration(): void {
  cy.findByRole("button", { name: /Manual setup/i }).click();
  cy.findByRole("button", { name: /Data/ }).should("be.visible");
}

/**
 * The metrics picker opens on the "Library" tab whenever the metrics library is
 * enabled (it is, under the pro token these specs activate).
 */
export function selectAllMetricsTab(): void {
  cy.findByRole("dialog").then(($dialog) => {
    if ($dialog.find('[role="tab"]').length > 0) {
      cy.findByRole("tab", { name: "All" }).click();
    }
  });
}

export interface AddMetricsAndDimensionsOptions {
  metrics: string[];
  dimensions?: string[];
}

/**
 * Pick metrics + dimensions through the "+ Data" picker.
 */
export function addMetricsAndDimensions({
  metrics,
  dimensions = [],
}: AddMetricsAndDimensionsOptions): void {
  cy.findByRole("button", { name: /Data/ }).click();
  cy.findByRole("menuitem", { name: "Metrics" }).click();
  cy.wait("@getDimensions");
  selectAllMetricsTab();
  for (const name of metrics) {
    cy.findByRole("checkbox", { name }).check({ force: true });
  }
  cy.findByRole("button", { name: "Add" }).click();

  if (dimensions.length > 0) {
    cy.findByRole("button", { name: /Data/ }).click();
    cy.findByRole("menuitem", { name: "Dimensions" }).click();
    for (const name of dimensions) {
      cy.findByRole("checkbox", { name }).check({ force: true });
    }
    cy.findByRole("button", { name: "Add" }).click();
  }
}

/**
 * Pick the named timelines (one or many) through the "+ Events" modal.
 */
export function addTimelinesToExploration(names: string | string[]): void {
  const list = Array.isArray(names) ? names : [names];
  cy.findByRole("button", { name: /Events/ }).click();
  for (const name of list) {
    cy.findByRole("checkbox", { name }).check({ force: true });
  }
  cy.findByRole("button", { name: "Add" }).click();
}

/**
 * Click `Start research`, wait for the create-exploration POST,
 * and assert we navigated to the detail page.
 */
export function beginResearch(): Cypress.Chainable<number> {
  cy.intercept("POST", "/api/exploration").as("createExploration");
  cy.findByRole("button", { name: /Start research/i }).click();
  return cy.wait("@createExploration").then(({ response }) => {
    // Unjustified type cast. FIXME
    const id = response?.body?.id as number;
    expect(id, "exploration id from POST /api/exploration response").to.be.a(
      "number",
    );
    cy.url().should("include", `/question/research/${id}`);
    return cy.wrap(id);
  });
}

/**
 * Shape of a single tool-call event the explorations agent emits over the AI-streaming protocol.
 */
export interface ExplorationToolCall {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result: unknown;
}

/**
 * Build a mock streaming SSE body emitting a sequence of tool calls in the
 * AI SDK v5/v6 `UIMessageChunk` wire protocol the client parses (see
 * `parseSSEStream` + `sse-types.ts` in `metabase/api/ai-streaming`): each
 * event is a `data: {json}` SSE line, wrapped in the backend's lifecycle
 * (`start` → `start-step` → events → `finish-step` → `finish` → `[DONE]`).
 * Tool results are passed as objects — the client JSON-stringifies non-string
 * outputs before handing them to consumers like `NewExplorationChat`.
 */
export function buildExplorationStreamingBody(
  toolCalls: ExplorationToolCall[],
): string {
  const events: unknown[] = [
    { type: "start", messageId: "mock-message" },
    { type: "start-step" },
  ];
  for (const tc of toolCalls) {
    events.push({
      type: "tool-input-available",
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      input: tc.args ?? {},
    });
    events.push({
      type: "tool-output-available",
      toolCallId: tc.toolCallId,
      output: tc.result,
    });
  }
  events.push({ type: "finish-step" });
  events.push({
    type: "finish",
    finishReason: "stop",
    messageMetadata: {
      usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
    },
  });
  return [
    ...events.map((event) => `data: ${JSON.stringify(event)}`),
    "data: [DONE]",
  ]
    .map((line) => `${line}\n\n`)
    .join("");
}

/**
 * Intercept the metabot agent-streaming endpoint and reply with a
 * canned tool-call stream. Same `@metabotAgent` alias as
 * `mockMetabotResponse`, so existing assertions like
 * `cy.wait("@metabotAgent").its("request.body.profile_id")` work.
 */
export function mockExplorationsAgentToolCalls(
  toolCalls: ExplorationToolCall[],
  overrides: Partial<StaticResponse> = {},
): void {
  cy.intercept("POST", "/api/metabot/agent-streaming", (req) => {
    req.reply({
      statusCode: 200,
      body: buildExplorationStreamingBody(toolCalls),
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
      },
      ...overrides,
    });
  }).as("metabotAgent");
}

export interface CreateExplorationViaApiOptions {
  name?: string;
  metricCardIds?: number[];
  dimensionIds?: string[];
  timelineIds?: number[];
  collectionId?: number | null;
}

export function createExplorationViaApi({
  name = "Test exploration",
  metricCardIds,
  dimensionIds,
  timelineIds = [],
  collectionId,
}: CreateExplorationViaApiOptions = {}): Cypress.Chainable<number> {
  let resolvedCollectionId: number | null = collectionId ?? null;
  if (collectionId === undefined) {
    cy.request("GET", "/api/user/current").then(({ body }) => {
      resolvedCollectionId = body.personal_collection_id ?? null;
    });
  }

  return cy
    .request("GET", "/api/exploration/dimensions")
    .then(({ body }: { body: ExplorationDimensionsResponse }) => {
      if (body.metrics.length === 0) {
        throw new Error(
          "No metrics returned from /api/exploration/dimensions — " +
            "did you forget to seed metrics via H.createQuestion?",
        );
      }
      const allDimensions = body.dimension_groups.flatMap((g) => g.dimensions);
      if (allDimensions.length === 0) {
        throw new Error(
          "No dimensions returned from /api/exploration/dimensions",
        );
      }
      const metricIds = metricCardIds ?? body.metrics.map((m) => m.id);
      const dimIds =
        dimensionIds ??
        // Pick the first dimension referenced by the first chosen metric.
        (() => {
          const firstMetric =
            body.metrics.find((m) => metricIds.includes(m.id)) ??
            body.metrics[0];
          const firstDim =
            allDimensions.find((d) =>
              firstMetric.dimension_ids.includes(d.id),
            ) ?? allDimensions[0];
          return [firstDim.id];
        })();

      const metrics = metricIds.map((id) => {
        const m = body.metrics.find((mm) => mm.id === id);
        return {
          card_id: id,
          dimension_mappings: m?.dimension_mappings ?? null,
        };
      });
      const dimensions = dimIds.map((id) => {
        const d = allDimensions.find((dd) => dd.id === id);
        if (!d) {
          throw new Error(`Dimension "${id}" not exposed by API`);
        }
        return {
          dimension_id: d.id,
          display_name: d.display_name,
          effective_type: d.effective_type,
          semantic_type: d.semantic_type,
        };
      });

      const blocks = metrics.map((metric) => ({
        type: "metric" as const,
        metrics: [metric],
        dimensions,
      }));
      return cy.request("POST", "/api/exploration", {
        name,
        prompt: null,
        collection_id: resolvedCollectionId,
        blocks,
        timeline_ids: timelineIds,
      });
    })
    .then(({ body }: { body: { id: number } }) => cy.wrap(body.id));
}

interface ExplorationDimensionsResponse {
  metrics: Array<{
    id: number;
    name: string;
    dimension_ids: string[];
    dimension_mappings: unknown;
  }>;
  dimension_groups: Array<{
    dimensions: Array<{
      id: string;
      display_name: string;
      effective_type: string | null;
      semantic_type: string | null;
    }>;
  }>;
}

export function visitExploration(id: number): void {
  cy.visit(`/question/research/${id}`);
  cy.findAllByRole("treeitem").first().should("be.visible");
}
