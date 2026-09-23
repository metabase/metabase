/**
 * Helpers for the dashboard-filters-management spec port
 * (dashboard-filters-management.cy.spec.js): the spec-local flow functions
 * (selectFilter, changeFilterType, changeOperator, verifyOperatorValue,
 * createDashboardWithFilterAndQuestionMapped) plus two small wrappers around
 * the shared findByDisplayValue (filters-repros.ts) so the Cypress
 * `findByDisplayValue(...).should("exist")` / `.click()` retry semantics carry
 * over — a bare one-shot lookup races the sidebar re-render after a type
 * change.
 *
 * Everything else is imported read-only from the shared dashboard modules.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { editDashboard, sidebar } from "./dashboard";
import { updateDashboardCards } from "./dashboard-core";
import { mockParameter } from "./dashboard-parameters";
import { createDashboardWithQuestions } from "./factories";
import { findByDisplayValue } from "./filters-repros";
import { SAMPLE_DATABASE } from "./sample-data";
import { visitDashboard } from "./ui";
import { popover } from "./ui";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

/**
 * Port of the spec-local selectFilter: click a filter pill by name inside the
 * edit-mode parameters widget container.
 */
export async function selectFilter(page: Page, name: string) {
  await page
    .getByTestId("edit-dashboard-parameters-widget-container")
    .getByText(name, { exact: true })
    .click();
}

/** The next-sibling control of a sidebar label (Cypress `findByText(x).next()`). */
function sidebarLabelNext(page: Page, label: string): Locator {
  return sidebar(page)
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::*[1]");
}

/**
 * Port of the spec-local changeFilterType: open the "Filter or parameter type"
 * select and pick a type from the popover.
 */
export async function changeFilterType(page: Page, type: string) {
  await sidebarLabelNext(page, "Filter or parameter type").click();
  await popover(page).getByText(type, { exact: true }).click();
}

/**
 * Port of the spec-local changeOperator: open the "Filter operator" select and
 * pick an operator from the popover.
 */
export async function changeOperator(page: Page, operator: string) {
  await sidebarLabelNext(page, "Filter operator").click();
  await popover(page).getByText(operator, { exact: true }).click();
}

/**
 * Port of the spec-local verifyOperatorValue: the "Filter operator" select's
 * textbox holds the given value. getByRole("textbox") mirrors the Cypress
 * findByRole and dodges the duplicate-accessible-name on the wrapper.
 */
export async function verifyOperatorValue(page: Page, value: string) {
  await expect(
    sidebarLabelNext(page, "Filter operator").getByRole("textbox"),
  ).toHaveValue(value);
}

/**
 * Retried wrapper around findByDisplayValue for `should("exist")` — the sidebar
 * re-renders after a type change, so a single-pass lookup can race it.
 */
export async function expectSidebarHasDisplayValue(page: Page, value: string) {
  await expect(async () => {
    await findByDisplayValue(sidebar(page), value);
  }).toPass();
}

/**
 * Retried wrapper around findByDisplayValue that clicks the matched control
 * (the Cypress `findByDisplayValue(...).click()`).
 */
export async function clickSidebarDisplayValue(page: Page, value: string) {
  await expect(async () => {
    const control = await findByDisplayValue(sidebar(page), value);
    await control.click();
  }).toPass();
}

/**
 * Port of the spec-local createDashboardWithFilterAndQuestionMapped: a People
 * question mapped to a single Text filter with a default value, visited and
 * put into edit mode.
 */
export async function createDashboardWithFilterAndQuestionMapped(
  page: Page,
  api: MetabaseApi,
) {
  const textFilter = mockParameter({
    name: "Text",
    slug: "string",
    id: "5aefc726",
    type: "string/=",
    sectionId: "string",
    default: "value to check default",
  });

  const peopleQuestionDetails = {
    query: { "source-table": PEOPLE_ID, limit: 5 },
  };

  const { dashboard, questions: cards } = await createDashboardWithQuestions(
    api,
    {
      dashboardDetails: { parameters: [textFilter] },
      questions: [peopleQuestionDetails],
    },
  );
  const [peopleCard] = cards;

  await updateDashboardCards(api, {
    dashboard_id: dashboard.id,
    cards: [
      {
        card_id: peopleCard.id,
        parameter_mappings: [
          {
            parameter_id: textFilter.id,
            card_id: peopleCard.id,
            target: ["dimension", ["field", PEOPLE.NAME, null]],
          },
        ],
      },
    ],
  });

  await visitDashboard(page, api, dashboard.id);
  await editDashboard(page);
}
