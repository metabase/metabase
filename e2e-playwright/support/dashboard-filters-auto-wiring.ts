/**
 * Spec-local helpers for the dashboard-filters-auto-wiring port
 * (dashboard-filters-auto-wiring.cy.spec.js). These are the functions the
 * Cypress spec defines inline at the bottom of the file; the shared H helpers
 * they build on come from the existing support modules (imported, never
 * edited).
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { getDashboardCard, pickEntity, saveDashboard, sidebar } from "./dashboard";
import { updateDashboardCards } from "./dashboard-core";
import {
  createDashboard,
  editingDashboardParametersContainer,
} from "./dashboard-parameters";
import { undoToast } from "./metrics";
import { openQuestionActions } from "./models";
import { undoToastList } from "./organization";
import { openQuestionsSidebar } from "./revisions";
import { icon, popover, visitQuestion } from "./ui";

/**
 * Port of the spec-local createDashboardWithCards: create a dashboard, then
 * PUT its dashcards. The Cypress version wraps the id as the "@dashboardId"
 * alias; the port returns it so callers can keep it in a describe-scoped var.
 */
export async function createDashboardWithCards(
  api: MetabaseApi,
  {
    dashboardName = "my dash",
    cards = [],
  }: { dashboardName?: string; cards?: Record<string, unknown>[] } = {},
): Promise<number> {
  const { id } = await createDashboard(api, { name: dashboardName });
  await updateDashboardCards(api, { dashboard_id: id, cards });
  return id;
}

/**
 * Port of the spec-local addCardToDashboard: open the questions sidebar and
 * click each card name in the add-card-sidebar list.
 */
export async function addCardToDashboard(
  page: Page,
  dashcardNames: string | string[] = "Orders Model",
) {
  const names =
    typeof dashcardNames === "string" ? [dashcardNames] : dashcardNames;
  await openQuestionsSidebar(page);
  for (const name of names) {
    await page
      .getByTestId("add-card-sidebar")
      .getByText(name, { exact: true })
      .click();
  }
}

/**
 * Port of the spec-local goToFilterMapping: click a filter's editing widget to
 * open its parameter mapping.
 */
export async function goToFilterMapping(page: Page, name = "Text") {
  await editingDashboardParametersContainer(page)
    .getByText(name, { exact: true })
    .click();
}

/** Port of the spec-local removeFilterFromDashboard. */
export async function removeFilterFromDashboard(page: Page, filterName = "Text") {
  await goToFilterMapping(page, filterName);
  await sidebar(page).getByRole("button", { name: "Remove" }).click();
}

/** Port of the spec-local removeFilterFromDashCard (the close icon on a card). */
export async function removeFilterFromDashCard(page: Page, dashcardIndex = 0) {
  await icon(getDashboardCard(page, dashcardIndex), "close").click();
}

/**
 * Port of the spec-local getTableCell: find the column index by header text,
 * then return the matching cell in the given row. `scope` is the dashcard the
 * Cypress version's `within()` block scopes to.
 */
export async function getTableCell(
  scope: Locator,
  columnName: string,
  rowIndex: number,
): Promise<Locator> {
  const headers = scope.getByRole("columnheader");
  await expect(headers.first()).toBeVisible();
  const texts = await headers.allTextContents();
  const columnIndex = texts.findIndex((text) => text === columnName);
  if (columnIndex < 0) {
    throw new Error(
      `Column "${columnName}" not found among ${JSON.stringify(texts)}`,
    );
  }
  return scope
    .getByTestId("table-body")
    .getByRole("row")
    .nth(rowIndex)
    .getByTestId("cell-data")
    .nth(columnIndex);
}

/**
 * Port of the spec-local addQuestionFromQueryBuilder: from the QB, add a
 * question to the "36275" dashboard via the entity picker, accept auto-connect,
 * and optionally save the dashboard.
 */
export async function addQuestionFromQueryBuilder(
  page: Page,
  {
    questionId,
    saveDashboardAfterAdd = true,
  }: { questionId: number; saveDashboardAfterAdd?: boolean },
) {
  await visitQuestion(page, questionId);

  await openQuestionActions(page);
  await popover(page).getByText("Add to dashboard", { exact: true }).click();

  await pickEntity(page, { path: ["Our analytics", "36275"], select: true });

  await undoToast(page).getByRole("button", { name: "Auto-connect" }).click();
  // After Auto-connect the suggestion toast animates out while the result toast
  // (the one carrying "Undo") animates in, so two toasts briefly coexist —
  // target the result toast rather than the singular getByTestId.
  await expect(
    undoToastList(page).filter({ hasText: "Undo" }).last(),
  ).toBeVisible();

  if (saveDashboardAfterAdd) {
    await saveDashboard(page);
  }
}
