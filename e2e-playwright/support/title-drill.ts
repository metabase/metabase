/**
 * Helpers for the title-drill spec port
 * (e2e/test/scenarios/dashboard/title-drill.cy.spec.js).
 *
 * New helpers only (parallel-agent rule). Ports of:
 * - the spec-local checkScalarResult / checkFilterLabelAndValue assertions
 * - H.createDashboardWithQuestions with the `dashboardName` + `cards` layout
 *   options the spike's filters-repros version doesn't take (the "various
 *   charts" test lays out four cards explicitly)
 * - waitForTitleDrillQuery: the reusable `cy.intercept(...).as("cardQuery")`
 *   the spec waits on repeatedly. After a title drill you leave the dashboard
 *   and the reruns fire against a DIFFERENT endpoint (the QB's /api/dataset,
 *   not the dashboard's dashcard-query URL), so a literal port of the
 *   dashboard-scoped alias would hang. Match either endpoint (plus the saved
 *   /api/card/:id/query) so the wait syncs on whatever the app actually fires.
 *
 * Everything else (create*, editDashboardCard, dashboardParametersPopover,
 * visitDashboard[WithParams], filterWidget, queryBuilderMain, popover, ...)
 * reuses existing support modules.
 */
import { expect } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { filterWidget } from "./dashboard";
import {
  type DashCard,
  type NativeQuestionDetails,
  type StructuredQuestionDetails,
  createDashboard,
  createNativeQuestion,
  createQuestion,
} from "./filters-repros";

/**
 * Port of the spec-local checkScalarResult:
 * cy.findByTestId("scalar-value").invoke("text").should("eq", result).
 */
export async function checkScalarResult(page: Page, result: string) {
  await expect(page.getByTestId("scalar-value")).toHaveText(result);
}

/**
 * Port of the spec-local checkFilterLabelAndValue:
 *   H.filterWidget().findByLabelText(label, { exact: false }).should("exist");
 *   H.filterWidget().contains(value);
 * The label check is "exist" (not "be.visible") — the accessible name is
 * duplicated onto the widget wrapper and the inner control, so scope to the
 * first match. `contains(value)` is a case-sensitive substring.
 */
export async function checkFilterLabelAndValue(
  page: Page,
  label: string,
  value: string,
) {
  await expect(
    filterWidget(page).getByLabel(label, { exact: false }).first(),
  ).toBeAttached();
  await expect(filterWidget(page).getByText(value).first()).toBeVisible();
}

// createDashboardWithQuestions is now canonical in ./factories; re-exported so
// this module's consumers keep their import unchanged.
export { createDashboardWithQuestions } from "./factories";

/**
 * The reusable `cy.intercept(...).as("cardQuery")` the spec waits on after each
 * run-button rerun. Register BEFORE the triggering action, await after. Matches
 * the dashboard dashcard-query, the QB ad-hoc /api/dataset, and the saved
 * /api/card/:id/query — see the file header for why all three.
 */
export function waitForTitleDrillQuery(page: Page): Promise<Response> {
  return page.waitForResponse((response) => {
    if (response.request().method() !== "POST") {
      return false;
    }
    const { pathname } = new URL(response.url());
    return (
      pathname === "/api/dataset" ||
      /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(
        pathname,
      ) ||
      /^\/api\/card\/\d+\/query$/.test(pathname)
    );
  });
}
