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
 * Enter the manual data-picking flow from the entry page. The "+ Data" /
 * "+ Events" pickers (the `research-content` plan pane) only mount after the
 * user clicks "Manual setup", so manual-flow tests must call this after
 * `visitNewExploration()`. Waits for the "+ Data" button as the load signal.
 */
export function startManualExploration(): void {
  cy.findByRole("button", { name: /Manual setup/i }).click();
  cy.findByRole("button", { name: /Data/ }).should("be.visible");
}

/**
 * The metrics picker opens on the "Library" tab whenever the metrics library is
 * enabled (it is, under the pro token these specs activate), which lists only
 * `in_library` metrics and hides ad-hoc seeded test metrics. Switch to the
 * "All" tab so every metric is listed. No-op when the library is disabled — the
 * tabs aren't rendered then.
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
 * Pick metrics + dimensions through the "+ Data" picker. The header
 * "Data" menu opens a modal per entity type; each row is a `Checkbox`
 * labelled with the entity name, and an "Add" button commits the
 * newly-checked rows. Assumes `visitNewExploration()` registered the
 * `@getDimensions` intercept already.
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
 * Each row is a `Checkbox` labelled with the timeline name; the "Add"
 * button commits the selection.
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
 * and assert we navigated to the detail page. Yields the new
 * exploration's id so callers can chain detail-page assertions.
 */
export function beginResearch(): Cypress.Chainable<number> {
  cy.intercept("POST", "/api/exploration").as("createExploration");
  cy.findByRole("button", { name: /Start research/i }).click();
  return cy.wait("@createExploration").then(({ response }) => {
    const id = response?.body?.id as number;
    expect(id, "exploration id from POST /api/exploration response").to.be.a(
      "number",
    );
    cy.url().should("include", `/question/research/${id}`);
    return cy.wrap(id);
  });
}

/**
 * Shape of a single tool-call event the explorations agent emits
 * over the AI-streaming protocol (Vercel AI SDK style — see
 * `frontend/src/metabase/api/ai-streaming/process-stream.ts`
 * `StreamingPartTypeRegistry`).
 */
export interface ExplorationToolCall {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result: unknown;
}

/**
 * Build a mock streaming SSE body emitting a sequence of tool-call
 * frames followed by a `finish_message` frame, in the format the
 * metabot streaming parser expects (`9:` for tool_call, `a:` for
 * tool_result, `d:` for finish — see `StreamingPartTypeRegistry`
 * in `process-stream.ts`).
 */
export function buildExplorationStreamingBody(
  toolCalls: ExplorationToolCall[],
): string {
  const lines: string[] = [];
  for (const tc of toolCalls) {
    lines.push(
      `9:${JSON.stringify({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args ? JSON.stringify(tc.args) : "",
      })}`,
    );
    lines.push(
      `a:${JSON.stringify({
        toolCallId: tc.toolCallId,
        result: JSON.stringify(tc.result),
      })}`,
    );
  }
  lines.push(
    `d:${JSON.stringify({
      finishReason: "stop",
      usage: { promptTokens: 100, completionTokens: 10 },
    })}`,
  );
  return lines.join("\n");
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
}

/**
 * Seed an exploration directly via the BE API without going
 * through the new-exploration UI. Picks the first metric +
 * dimension exposed by `/api/exploration/dimensions` unless the
 * caller provides explicit ids.
 *
 * Yields the new exploration's id. Note: query results are
 * generated asynchronously by the BE; callers must wait for them
 * separately (e.g. `cy.findAllByLabelText("Ready")`).
 */
export function createExplorationViaApi({
  name = "Test exploration",
  metricCardIds,
  dimensionIds,
  timelineIds = [],
}: CreateExplorationViaApiOptions = {}): Cypress.Chainable<number> {
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

      // The BE's `generate-queries!` only materializes queries for
      // (metric, dimension) pairs where the metric's snapshotted
      // `dimension_mappings` resolves a target for that dimension.
      // Pass `null` and we get an exploration with zero queries —
      // the sidebar tree renders only the empty section headings
      // and `findAllByRole("treeitem")` finds nothing. Echo back
      // the BE's own mappings so query generation succeeds.
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
      // The create endpoint persists one `ExplorationThreadGroup` per `:groups`
      // entry — there's no top-level metrics/dimensions any more. Mirror the
      // manual UI's one-block-per-metric shape: a metric-anchored group per
      // metric, each crossed with the chosen dimensions.
      const groups = metrics.map((metric) => ({
        type: "metric" as const,
        metrics: [metric],
        dimensions,
      }));
      return cy.request("POST", "/api/exploration", {
        name,
        prompt: null,
        groups,
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
  // Sidebar rows use `role="treeitem"`. Wait for at least one to
  // appear so subsequent queries don't race the initial render.
  cy.findAllByRole("treeitem").first().should("be.visible");
}
