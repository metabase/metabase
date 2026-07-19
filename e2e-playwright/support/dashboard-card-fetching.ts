/**
 * Helpers for the dashboard-card-fetching spec — the sample-question ids, the
 * spec-local `cards` layout, and the request-body capture its single test
 * needs. New module (per the porting brief); shared helpers (createDashboard,
 * updateDashboardCards, visitDashboard) are imported read-only in the spec.
 */
import type { Page, Response } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

function findQuestionId(name: string): number {
  const question = SAMPLE_INSTANCE_DATA.questions.find(
    (question) => question.name === name,
  );
  if (!question) {
    throw new Error(
      `Question "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(question.id);
}

/** Ports of ORDERS_COUNT_QUESTION_ID / ORDERS_BY_YEAR_QUESTION_ID
 * (cypress_sample_instance_data.js). */
export const ORDERS_COUNT_QUESTION_ID = findQuestionId("Orders, Count");
export const ORDERS_BY_YEAR_QUESTION_ID = findQuestionId(
  "Orders, Count, Grouped by Created At (year)",
);

/** Port of the spec's module-level `cards` layout. */
export const CARDS = [
  {
    card_id: ORDERS_COUNT_QUESTION_ID,
    row: 0,
    col: 0,
    size_x: 5,
    size_y: 4,
  },
  {
    card_id: ORDERS_BY_YEAR_QUESTION_ID,
    row: 0,
    col: 5,
    size_x: 5,
    size_y: 5,
  },
];

function isDashcardQuery(response: Response): boolean {
  const { pathname } = new URL(response.url());
  return (
    response.request().method() === "POST" &&
    /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(pathname)
  );
}

/**
 * Port of `cy.wait(["@dashcardQuery", "@dashcardQuery"])` where the test then
 * reads each interception's request body: collect the POST bodies of the next
 * `count` dashcard-query requests.
 *
 * Call this BEFORE the triggering navigation and await the returned promise
 * after (PORTING rule 2). A single `page.on("response")` listener is used
 * rather than N `waitForResponse` promises, because identical `waitForResponse`
 * predicates registered together all resolve on the SAME first matching
 * response — this collects `count` DISTINCT responses instead, matching
 * cy.wait's sequential-alias semantics.
 */
export function collectDashcardQueryBodies(
  page: Page,
  count: number,
): Promise<Record<string, unknown>[]> {
  const bodies: Record<string, unknown>[] = [];
  return new Promise((resolve) => {
    const handler = (response: Response) => {
      if (isDashcardQuery(response)) {
        bodies.push(response.request().postDataJSON());
        if (bodies.length >= count) {
          page.off("response", handler);
          resolve(bodies);
        }
      }
    };
    page.on("response", handler);
  });
}
