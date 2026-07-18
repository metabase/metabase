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

/**
 * Port of H.createDashboardWithQuestions (api/createDashboardWithQuestions.ts):
 * create the dashboard, then create each question and append it to the
 * dashboard's dashcards (re-reading the dashboard each time so earlier cards
 * survive the PUT), honoring an optional per-card layout array.
 */
export async function createDashboardWithQuestions(
  api: MetabaseApi,
  {
    dashboardName,
    questions,
    cards,
  }: {
    dashboardName?: string;
    questions: (StructuredQuestionDetails | NativeQuestionDetails)[];
    cards?: Record<string, unknown>[];
  },
): Promise<{ dashboard: { id: number }; questions: { id: number }[] }> {
  const dashboard = await createDashboard(api, { name: dashboardName });
  const created: { id: number }[] = [];
  for (const [index, questionDetails] of questions.entries()) {
    const question =
      "native" in questionDetails
        ? await createNativeQuestion(api, questionDetails)
        : await createQuestion(api, questionDetails);
    const current = (await (
      await api.get(`/api/dashboard/${dashboard.id}`)
    ).json()) as { dashcards: DashCard[] };
    await api.put(`/api/dashboard/${dashboard.id}`, {
      dashcards: [
        ...current.dashcards,
        {
          id: -1,
          card_id: question.id,
          row: 0,
          col: 0,
          size_x: 11,
          size_y: 8,
          ...(cards ? cards[index] : {}),
        },
      ],
    });
    created.push(question);
  }
  return { dashboard, questions: created };
}

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
