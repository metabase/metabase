/**
 * Spec-local helpers for the port of
 * e2e/test/scenarios/sharing/alert/alert-types.cy.spec.js.
 *
 * Everything reusable already exists in shared modules and is imported
 * read-only by tests/alert-types.spec.ts (porting rule 9 — shared modules stay
 * untouched, so anything new lands here):
 * - `setupSMTP` / `isMaildevRunning` from support/onboarding-extras.ts
 * - `ORDERS_QUESTION_ID` / `ORDERS_BY_YEAR_QUESTION_ID` / `SAMPLE_DATABASE`
 *   from support/sample-data.ts
 * - `createQuestion` from support/factories.ts
 * - `modal` / `popover` / `visitQuestion` from support/ui.ts
 *
 * What lands here is the spec's own module-level data (the multi-series
 * question, the raw test-case table) and the two response-wait helpers that
 * stand in for the upstream `cy.intercept`/`cy.wait` aliases.
 */
import type { Page, Response } from "@playwright/test";

import { SAMPLE_DATABASE } from "./sample-data";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

/**
 * Port of the spec's module-level `multiSeriesQuestionWithGoal`.
 *
 * Two breakouts is the whole point: `getDefaultTriggerOption` / the
 * `hasSingleTriggerOption` branch in CreateOrEditQuestionAlertModal only offers
 * the goal options for a single-series timeseries, so this shape must fall back
 * to "has results" even though `graph.show_goal` would otherwise apply.
 *
 * Field ids are read from e2e/support/cypress_sample_database.json via
 * support/sample-data.ts, never hardcoded: PEOPLE_ID=6, PEOPLE.SOURCE=53,
 * PEOPLE.CREATED_AT=57 (values confirmed at port time).
 */
export const multiSeriesQuestionWithGoal = {
  name: "multi",
  query: {
    "source-table": PEOPLE_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", PEOPLE.SOURCE, null],
      ["field", PEOPLE.CREATED_AT, { "temporal-unit": "month" }],
    ],
  },
  display: "line",
};

/**
 * Port of `cy.intercept("GET", "/api/channel").as("channel")` +
 * `cy.wait("@channel")`.
 *
 * Must be called BEFORE the action that triggers the request. Cypress registers
 * the alias in `beforeEach` and `cy.wait` pops the already-recorded response;
 * Playwright's `waitForResponse` only sees responses that arrive after the
 * promise is created, so the ordering is load bearing rather than stylistic.
 *
 * NOTE (probed, see findings-inbox/alert-types.md): this is a plain LIST of the
 * `channel` table. It does not contact webhook-tester — the connection test is
 * the separate `POST /api/channel/test`. Confirmed by request-count delta
 * against :9080 (1 before the run, 1 after).
 */
export function waitForChannels(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/channel",
  );
}

/**
 * Port of `cy.intercept("POST", "/api/notification").as("updateAlert")` +
 * `cy.wait("@updateAlert").then(({ response: { body } }) => …)`.
 *
 * Same ordering requirement as `waitForChannels`. The upstream alias name says
 * "update" but the intercept is a POST, i.e. alert CREATION; kept as-is.
 */
export function waitForAlertSave(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/notification",
  );
}

export type AlertNotificationBody = {
  payload?: { send_condition?: string; send_once?: boolean };
};
