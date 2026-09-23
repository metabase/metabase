/**
 * Helpers for the question-reproductions-2 spec port
 * (e2e/test/scenarios/question-reproductions/reproductions-2.cy.spec.js).
 * Lives in its own module so the shared support files stay untouched
 * (PORTING.md rule 9). Everything else the spec needs is imported read-only
 * from the shared helper modules.
 */
import type { Page, Response } from "@playwright/test";

import { expect } from "./fixtures";
import { openVizSettingsSidebar } from "./charts";
import { popover } from "./ui";

/** The custom-column expression the "Custom columns visualization settings"
 * describe adds to its question. */
export const EXPRESSION_NAME = "TEST_EXPRESSION";

/**
 * Port of the spec-local goToExpressionSidebarVisualizationSettings: open the
 * viz settings sidebar and click the custom column's settings button.
 */
export async function goToExpressionSidebarVisualizationSettings(
  page: Page,
  expressionName: string = EXPRESSION_NAME,
) {
  await openVizSettingsSidebar(page);
  await page.getByTestId(`${expressionName}-settings-button`).click();
}

/**
 * Port of the spec-local saveModifiedQuestion: save an overwrite of the
 * original question and confirm the "Save" action then disappears from the
 * header (the reproduction: viz-settings-only changes must be saveable, and
 * saving must clear the dirty state).
 */
export async function saveModifiedQuestion(page: Page) {
  const actionPanel = page.getByTestId("qb-header-action-panel");
  await actionPanel.getByText("Save", { exact: true }).click();

  const saveModal = page.getByTestId("save-question-modal");
  await expect(saveModal.getByText(/Replace original question/i)).toBeVisible();
  await saveModal.getByText("Save", { exact: true }).click();

  await expect(actionPanel.getByText("Save", { exact: true })).toHaveCount(0);
}

/**
 * Counter for a class of responses over the whole test — the Playwright
 * equivalent of `cy.intercept(...).as("x")` + `cy.get("@x.all").should("have.
 * length", 0)`. Register at the start of the test; read the returned getter at
 * the assertion point.
 */
export function countResponses(
  page: Page,
  predicate: (response: Response) => boolean,
): () => number {
  let count = 0;
  page.on("response", (response) => {
    if (predicate(response)) {
      count += 1;
    }
  });
  return () => count;
}

/** Matcher for POST /api/dataset (the "@dataset" alias). */
export function isDatasetResponse(response: Response): boolean {
  return (
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/api/dataset"
  );
}

/** Matcher for POST /api/card/:id/query (the "@cardQuery" alias). */
export function isCardQueryResponse(response: Response): boolean {
  return (
    response.request().method() === "POST" &&
    /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname)
  );
}

/**
 * Register a wait for the next GET /api/card/:id/query_metadata (the
 * "@queryMetadata" alias in issue 43216). Call BEFORE the triggering action;
 * await after.
 */
export function waitForCardQueryMetadata(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/card\/.+\/query_metadata$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/**
 * Register a wait for the next GET /api/search whose query string contains
 * `term` (the "@searchSource" / "@searchTarget" aliases in issue 43216, whose
 * globs were `/api/search*source*` / `/api/search*target*`). Call BEFORE the
 * triggering action; await after.
 */
export function waitForSearchContaining(page: Page, term: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/search" &&
      response.url().includes(term),
  );
}
