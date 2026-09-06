/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/joins/joins-reproductions.cy.spec.js.
 *
 * Lives in its own module so the shared support files stay untouched
 * (PORTING.md rule 9).
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

export const MYSQL_SKIP_REASON =
  "Requires the QA MySQL8 container and its mysql-8 snapshot (set PW_QA_DB_ENABLED)";

export const POSTGRES_SKIP_REASON =
  "Requires the QA Postgres12 container and its postgres-12 snapshot (set PW_QA_DB_ENABLED)";

// === response waits (the spec's cy.intercept + cy.wait aliases) ===

/** POST /api/dataset — the "@dataset" / "@postDataset" alias. */
export function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** GET /api/automagic-dashboards/adhoc/** — the "@xray" alias. */
export function waitForXray(page: Page): Promise<Response> {
  return page.waitForResponse((response) =>
    new URL(response.url()).pathname.startsWith(
      "/api/automagic-dashboards/adhoc/",
    ),
  );
}

/**
 * Port of `cy.wait("@postDataset")` repeated N times.
 *
 * Three concurrent `waitForResponse`s on one predicate all resolve on the same
 * hit (PORTING: "port cy.wait(['@a','@a','@a']) as one response COUNTER"), so
 * this installs a passive counter instead. It is installed before the
 * navigation deliberately: Cypress's alias queue starts consuming from the
 * first *unconsumed* response, and the ad-hoc question visit already fired one
 * POST /api/dataset that nothing consumed — so upstream's 11 waits are
 * satisfied by that one plus 10 x-ray queries. Counting from t=0 and polling to
 * `>= 11` is the same total.
 */
export function countDatasetResponses(page: Page): () => number {
  let count = 0;
  page.on("response", (response) => {
    if (
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset"
    ) {
      count += 1;
    }
  });
  return () => count;
}

// === issue 23293 ===

/**
 * Port of the spec-local modifyColumn(columnName, action). `findByLabelText`
 * with a string is an exact match (PORTING rule 1).
 */
export async function modifyColumn(
  page: Page,
  columnName: string,
  action: "add" | "remove",
) {
  const sidebar = page.getByTestId("sidebar-left");
  await sidebar
    .getByRole("button", { name: "Add or remove columns", exact: true })
    .click();

  const checkbox = sidebar.getByLabel(columnName, { exact: true });
  if (action === "add") {
    await expect(checkbox).not.toBeChecked();
  } else {
    await expect(checkbox).toBeChecked();
  }
  await checkbox.click();

  await sidebar
    .getByRole("button", { name: "Done picking columns", exact: true })
    .click();
}

// === issue 27521 ===

/**
 * Port of the spec-local assertTableHeader(index, name):
 * `cy.findAllByTestId("header-cell").eq(index).should("have.text", name)`.
 *
 * Kept PAGE-WIDE on purpose. The shared `tableHeaderColumn` scopes to
 * `table-header`, but here the Cypress original is itself page-wide *and* the
 * assertion is positional (`.eq(index)`), so narrowing the set would shift the
 * indices this test is about.
 */
export async function assertTableHeader(
  page: Page,
  index: number,
  name: string,
) {
  await expect(page.getByTestId("header-cell").nth(index)).toHaveText(name);
}

/**
 * Port of `cy.contains(text)` inside a scope: a case-sensitive SUBSTRING match
 * yielding the first hit (PORTING rule 1's caveat — Playwright's string
 * matching is case-INsensitive, so this goes through a regex).
 */
export function containsText(scope: Locator | Page, text: string): Locator {
  return scope.getByText(new RegExp(escapeRegExp(text))).first();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
