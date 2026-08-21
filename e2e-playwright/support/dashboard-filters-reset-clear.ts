/**
 * Helpers for the dashboard-filters-reset-clear spec port
 * (dashboard-filters-reset-clear.cy.spec.ts).
 *
 * The Cypress original keeps almost all of its logic in module-level
 * functions (createDashboardWithParameters, checkDashboardParameters,
 * checkParameterSidebarDefaultValue, the cross-tab reset checks and the
 * per-widget status-icon lookups). They are ported here so the spec file
 * mirrors upstream: each `it` builds a dashboard and delegates to these
 * flows, passing type-specific set/update callbacks.
 *
 * Callbacks take `page` as their first argument (Cypress's global `cy`/`H`
 * has no equivalent), then the widget label and the value — the same
 * `(label, value)` pair the originals used.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { editDashboard, getDashboardCard } from "./dashboard";
import {
  applyFilterButton,
  createQuestionAndDashboard,
  dashboardParameterSidebar,
} from "./dashboard-parameters";
import { createDashboardWithTabs, updateDashboardCards } from "./dashboard-core";
import { icon, popover, visitDashboard } from "./ui";

export const NO_DEFAULT_NON_REQUIRED = "no default value, non-required";
export const DEFAULT_NON_REQUIRED = "default value, non-required";
export const DEFAULT_REQUIRED = "default value, required";

type Scope = Page | Locator;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Interpret the Cypress key sequences this spec's callbacks type into
 * inputs: `{backspace}` (delete the last token/char) and `{selectAll}`
 * (Ctrl/Cmd+A). Plain runs are typed with real keystrokes (pressSequentially)
 * so the token-field / autocomplete widgets react as they would to a user.
 */
export async function typeCypress(locator: Locator, text: string) {
  // Cypress's `.type()` focuses with the caret at the END of any existing
  // text; Playwright's press/pressSequentially focus with the caret at the
  // start, so a leading `{backspace}` over pre-filled text (id/number single
  // update: "1" + "{backspace}2") became "21" instead of "2". Anchor the
  // caret at the end first (a no-op on empty inputs, so multi-token comboboxes
  // are unaffected).
  await locator.press("End");
  const parts = text.split(/(\{[^}]+\})/).filter(Boolean);
  for (const part of parts) {
    if (part === "{backspace}") {
      await locator.press("Backspace");
    } else if (part === "{selectAll}") {
      await locator.press("ControlOrMeta+a");
    } else {
      await locator.pressSequentially(part);
    }
  }
}

/** Port of H.fieldValuesTextbox: cy.findByRole("textbox"). */
export function fieldValuesTextbox(scope: Scope): Locator {
  return scope.getByRole("textbox");
}

/** Port of the spec-local filter(label): cy.findByLabelText(label) (exact). */
export function filter(scope: Scope, label: string): Locator {
  return scope.getByLabel(label, { exact: true });
}

/** Port of the spec-local editFilter(label). */
export async function editFilter(page: Page, label: string) {
  await page
    .getByTestId("edit-dashboard-parameters-widget-container")
    .getByText(label, { exact: true })
    .click();
}

function clearIcon(scope: Scope, label: string): Locator {
  return icon(filter(scope, label), "close");
}

function resetIcon(scope: Scope, label: string): Locator {
  return icon(filter(scope, label), "revert");
}

function chevronIcon(scope: Scope, label: string): Locator {
  return icon(filter(scope, label), "chevrondown");
}

/** Port of the spec-local clearButton(label). */
export function clearButton(scope: Scope, label: string): Locator {
  return filter(scope, label).getByLabel("Clear", { exact: true });
}

/** Port of the spec-local resetButton(label). */
export function resetButton(scope: Scope, label: string): Locator {
  return filter(scope, label).getByLabel("Reset filter to default state", {
    exact: true,
  });
}

/**
 * Port of the spec-local checkStatusIcon: exactly one of the three status
 * icons is visible (or none). `should("not.exist")` → toHaveCount(0);
 * `should("be.visible")` → toBeVisible().
 */
export async function checkStatusIcon(
  scope: Scope,
  label: string,
  status: "chevron" | "reset" | "clear" | "none",
) {
  const clear = clearIcon(scope, label);
  const reset = resetIcon(scope, label);
  const chevron = chevronIcon(scope, label);

  if (status === "clear") {
    await expect(clear).toBeVisible();
  } else {
    await expect(clear).toHaveCount(0);
  }

  if (status === "reset") {
    await expect(reset).toBeVisible();
  } else {
    await expect(reset).toHaveCount(0);
  }

  if (status === "chevron") {
    await expect(chevron).toBeVisible();
  } else {
    await expect(chevron).toHaveCount(0);
  }
}

const DASHBOARD_MENU = "Move, trash, and more…";

/** Port of the spec-local checkResetAllFiltersShown. */
export async function checkResetAllFiltersShown(page: Page) {
  await page.getByLabel(DASHBOARD_MENU, { exact: true }).click();
  await expect(
    popover(page).getByText("Reset all filters", { exact: true }),
  ).toBeVisible();
  await page.getByLabel(DASHBOARD_MENU, { exact: true }).click();
}

/** Port of the spec-local checkResetAllFiltersHidden. */
export async function checkResetAllFiltersHidden(page: Page) {
  await page.getByLabel(DASHBOARD_MENU, { exact: true }).click();
  // Guard against a false pass: assert the menu actually opened (some other
  // item is present) before asserting "Reset all filters" is absent.
  await expect(popover(page)).toBeVisible();
  await expect(
    popover(page).getByText("Reset all filters", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel(DASHBOARD_MENU, { exact: true }).click();
}

/** Click the dashboard menu's "Reset all filters" item. */
export async function resetAllFilters(page: Page) {
  await page.getByLabel(DASHBOARD_MENU, { exact: true }).click();
  await popover(page).getByText("Reset all filters", { exact: true }).click();
}

/** Port of the spec-local addDateFilter. */
export async function addDateFilter(page: Page, label: string, value: string) {
  await filter(page, label).click();
  const textbox = popover(page).getByRole("textbox");
  await textbox.clear();
  await textbox.pressSequentially(value);
  await textbox.blur();
  await popover(page).getByRole("button", { name: "Add filter" }).click();
}

/** Port of the spec-local updateDateFilter. */
export async function updateDateFilter(
  page: Page,
  label: string,
  value: string,
) {
  await filter(page, label).click();
  const textbox = popover(page).getByRole("textbox");
  await textbox.clear();
  await textbox.pressSequentially(value);
  await textbox.blur();
  await popover(page)
    .getByRole("button", { name: /(Add|Update) filter/ })
    .click();
}

/** Port of the spec-local addRangeFilter. */
export async function addRangeFilter(
  page: Page,
  label: string,
  firstValue: string,
  secondValue: string,
) {
  await filter(page, label).click();
  const first = popover(page).getByRole("textbox").first();
  await first.clear();
  await first.pressSequentially(firstValue);
  await first.blur();
  const last = popover(page).getByRole("textbox").last();
  await last.clear();
  await last.pressSequentially(secondValue);
  await last.blur();
  await popover(page).getByRole("button", { name: "Add filter" }).click();
}

/** Port of the spec-local updateRangeFilter. */
export async function updateRangeFilter(
  page: Page,
  label: string,
  firstValue: string,
  secondValue: string,
) {
  await filter(page, label).click();
  const first = popover(page).getByRole("textbox").first();
  await first.clear();
  await first.pressSequentially(firstValue);
  await first.blur();
  const last = popover(page).getByRole("textbox").last();
  await last.clear();
  await last.pressSequentially(secondValue);
  await last.blur();
  await popover(page).getByRole("button", { name: "Update filter" }).click();
}

/** Case-sensitive substring listitem matcher (cy.contains semantics). */
export function listItemContaining(scope: Scope, text: string): Locator {
  return scope
    .getByRole("listitem")
    .filter({ hasText: new RegExp(escapeRegExp(text)) });
}

// === dashboard creation ===

type ParameterList = Record<string, unknown>[];

/** Port of the spec-local createDashboardWithParameters. */
export async function createDashboardWithParameters(
  mb: { api: MetabaseApi },
  page: Page,
  questionDetails: Parameters<MetabaseApi["createQuestion"]>[0],
  targetField: unknown,
  parameters: ParameterList,
) {
  const { cardId, dashboardId } = await createQuestionAndDashboard(mb.api, {
    questionDetails,
    dashboardDetails: { parameters },
  });

  await updateDashboardCards(mb.api, {
    dashboard_id: dashboardId,
    cards: [
      {
        card_id: cardId,
        parameter_mappings: parameters.map((parameter) => ({
          parameter_id: parameter.id,
          card_id: cardId,
          target: ["dimension", targetField],
        })),
      },
    ],
  });

  await visitDashboard(page, mb.api, dashboardId);
}

/** Port of the spec-local createDashboardWithParameterInEachTab. */
export async function createDashboardWithParameterInEachTab(
  mb: { api: MetabaseApi },
  page: Page,
  {
    autoApplyFilters,
    parameters: [parameterA, parameterB],
    ordersQuestionId,
    ordersCountQuestionId,
    createdAtField,
    tabA,
    tabB,
  }: {
    autoApplyFilters: boolean;
    parameters: [Record<string, unknown>, Record<string, unknown>];
    ordersQuestionId: number;
    ordersCountQuestionId: number;
    createdAtField: unknown;
    tabA: { id: number; name: string };
    tabB: { id: number; name: string };
  },
) {
  const dashboard = await createDashboardWithTabs(mb.api, {
    tabs: [tabA, tabB],
    parameters: [parameterA, parameterB],
    auto_apply_filters: autoApplyFilters,
    dashcards: [
      {
        id: -1,
        dashboard_tab_id: tabA.id,
        size_x: 10,
        size_y: 4,
        row: 0,
        col: 0,
        card_id: ordersQuestionId,
        parameter_mappings: [
          {
            parameter_id: parameterA.id,
            card_id: ordersQuestionId,
            target: ["dimension", createdAtField],
          },
        ],
      },
      {
        id: -2,
        dashboard_tab_id: tabB.id,
        size_x: 10,
        size_y: 4,
        row: 0,
        col: 0,
        card_id: ordersCountQuestionId,
        parameter_mappings: [
          {
            parameter_id: parameterB.id,
            card_id: ordersCountQuestionId,
            target: ["dimension", createdAtField],
          },
        ],
      },
    ],
  });
  // POST /api/dashboard ignores auto_apply_filters (it defaults to true) and
  // the shared createDashboardWithTabs PUT spreads that response back, so the
  // "off" variant would silently stay on. Force the value with a dedicated
  // PUT (mirrors how H.createDashboard holds the flag back for a follow-up).
  await mb.api.put(`/api/dashboard/${dashboard.id}`, {
    auto_apply_filters: autoApplyFilters,
  });
  await visitDashboard(page, mb.api, dashboard.id);
}

// === value-setter callback types ===

export type ValueSetter<T> = (
  page: Page,
  label: string,
  value: T,
) => Promise<void>;

export type CheckDashboardParametersOptions<T> = {
  defaultValueFormatted: string;
  otherValue: T;
  otherValueFormatted: string;
  setValue: ValueSetter<T>;
  updateValue?: ValueSetter<T>;
  setDefaultValue?: ValueSetter<T>;
  updateDefaultValue?: ValueSetter<T>;
};

/** Port of the spec-local checkDashboardParameters. */
export async function checkDashboardParameters<T = string>(
  page: Page,
  {
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue = setValue,
    setDefaultValue = setValue,
    updateDefaultValue = updateValue ?? setValue,
  }: CheckDashboardParametersOptions<T>,
) {
  // no default value, non-required, no current value
  await checkStatusIcon(page, NO_DEFAULT_NON_REQUIRED, "chevron");
  await checkResetAllFiltersHidden(page);

  // no default value, non-required, has current value
  await setValue(page, NO_DEFAULT_NON_REQUIRED, otherValue);
  await expect(filter(page, NO_DEFAULT_NON_REQUIRED)).toContainText(
    otherValueFormatted,
  );
  await checkStatusIcon(page, NO_DEFAULT_NON_REQUIRED, "clear");
  await checkResetAllFiltersShown(page);

  // reset all filters
  await resetAllFilters(page);
  await expect(filter(page, NO_DEFAULT_NON_REQUIRED)).toContainText(
    NO_DEFAULT_NON_REQUIRED,
  );
  await checkStatusIcon(page, NO_DEFAULT_NON_REQUIRED, "chevron");
  await checkResetAllFiltersHidden(page);

  // revert so that we can try clearing with status button as well
  await setValue(page, NO_DEFAULT_NON_REQUIRED, otherValue);

  // clear with status button
  await clearButton(page, NO_DEFAULT_NON_REQUIRED).click();
  await expect(filter(page, NO_DEFAULT_NON_REQUIRED)).toContainText(
    NO_DEFAULT_NON_REQUIRED,
  );
  await checkStatusIcon(page, NO_DEFAULT_NON_REQUIRED, "chevron");
  await checkResetAllFiltersHidden(page);

  // has default value, non-required, current value same as default
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "clear");
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    defaultValueFormatted,
  );
  await checkResetAllFiltersHidden(page);

  await clearButton(page, DEFAULT_NON_REQUIRED).click();
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    DEFAULT_NON_REQUIRED,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "reset");
  await checkResetAllFiltersShown(page);

  // reset all filters
  await resetAllFilters(page);
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "clear");
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    defaultValueFormatted,
  );

  // revert so that we can try resetting with status button as well
  await clearButton(page, DEFAULT_NON_REQUIRED).click();

  // has default value, non-required, no current value
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    DEFAULT_NON_REQUIRED,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "reset");
  await checkResetAllFiltersShown(page);

  // reset with status button
  await resetButton(page, DEFAULT_NON_REQUIRED).click();
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    defaultValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "clear");
  await checkResetAllFiltersHidden(page);

  // has default value, non-required, current value different than default
  await updateValue(page, DEFAULT_NON_REQUIRED, otherValue);
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    otherValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "reset");
  await checkResetAllFiltersShown(page);

  // reset all filters
  await resetAllFilters(page);
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    defaultValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "clear");
  await checkResetAllFiltersHidden(page);

  // revert so that we can try resetting with status button as well
  await updateValue(page, DEFAULT_NON_REQUIRED, otherValue);

  // reset with status button
  await resetButton(page, DEFAULT_NON_REQUIRED).click();
  await expect(filter(page, DEFAULT_NON_REQUIRED)).toContainText(
    defaultValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_NON_REQUIRED, "clear");
  await checkResetAllFiltersHidden(page);

  // has default value, required, value same as default
  await checkStatusIcon(page, DEFAULT_REQUIRED, "none");
  await checkResetAllFiltersHidden(page);

  // has default value, required, current value different than default
  await updateValue(page, DEFAULT_REQUIRED, otherValue);
  await expect(filter(page, DEFAULT_REQUIRED)).toContainText(
    otherValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_REQUIRED, "reset");
  await checkResetAllFiltersShown(page);

  // reset all filters
  await resetAllFilters(page);
  await expect(filter(page, DEFAULT_REQUIRED)).toContainText(
    defaultValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_REQUIRED, "none");
  await checkResetAllFiltersHidden(page);

  // revert so that we can try resetting with status button as well
  await updateValue(page, DEFAULT_REQUIRED, otherValue);

  // reset with status button
  await resetButton(page, DEFAULT_REQUIRED).click();
  await expect(filter(page, DEFAULT_REQUIRED)).toContainText(
    defaultValueFormatted,
  );
  await checkStatusIcon(page, DEFAULT_REQUIRED, "none");
  await checkResetAllFiltersHidden(page);

  await checkParameterSidebarDefaultValue(page, {
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue: setDefaultValue,
    updateValue: updateDefaultValue,
  });
}

/** Port of the spec-local checkParameterSidebarDefaultValue. */
export async function checkParameterSidebarDefaultValue<T = string>(
  page: Page,
  {
    defaultValueFormatted,
    otherValue,
    otherValueFormatted,
    setValue,
    updateValue,
  }: {
    defaultValueFormatted: string;
    otherValue: T;
    otherValueFormatted: string;
    setValue: ValueSetter<T>;
    updateValue: ValueSetter<T>;
  },
) {
  const sidebar = dashboardParameterSidebar(page);

  await editDashboard(page);

  // NO_DEFAULT_NON_REQUIRED
  await editFilter(page, NO_DEFAULT_NON_REQUIRED);
  await filter(sidebar, "Default value").scrollIntoViewIfNeeded();
  await expect(
    filter(sidebar, "Default value").getByText("No default", { exact: true }),
  ).toBeVisible();
  await checkStatusIcon(sidebar, "Default value", "chevron");

  await setValue(page, "Default value", otherValue);

  await expect(filter(sidebar, "Default value")).toContainText(
    otherValueFormatted,
  );
  await checkStatusIcon(sidebar, "Default value", "clear");
  await clearButton(sidebar, "Default value").click();
  await expect(filter(sidebar, "Default value")).toContainText("No default");
  await checkStatusIcon(sidebar, "Default value", "chevron");

  // DEFAULT_NON_REQUIRED
  await editFilter(page, DEFAULT_NON_REQUIRED);
  await expect(filter(sidebar, "Default value")).toContainText(
    defaultValueFormatted,
  );
  await checkStatusIcon(sidebar, "Default value", "clear");
  await clearButton(sidebar, "Default value").click();
  await expect(filter(sidebar, "Default value")).toContainText("No default");
  await checkStatusIcon(sidebar, "Default value", "chevron");

  await setValue(page, "Default value", otherValue);

  await expect(filter(sidebar, "Default value")).toContainText(
    otherValueFormatted,
  );
  await checkStatusIcon(sidebar, "Default value", "clear");

  // DEFAULT_REQUIRED
  await editFilter(page, DEFAULT_REQUIRED);
  await expect(filter(sidebar, "Default value")).toContainText(
    defaultValueFormatted,
  );
  await checkStatusIcon(sidebar, "Default value", "clear");
  await clearButton(sidebar, "Default value").click();
  await expect(
    filter(sidebar, "Default value (required)"),
  ).toContainText("No default");
  await checkStatusIcon(sidebar, "Default value (required)", "chevron");

  await updateValue(page, "Default value (required)", otherValue);

  await expect(filter(sidebar, "Default value")).toContainText(
    otherValueFormatted,
  );
  await checkStatusIcon(sidebar, "Default value", "clear");
}

// === cross-tab reset checks ===

/** Port of the spec-local checkResetAllFiltersWorksAcrossTabs. */
export async function checkResetAllFiltersWorksAcrossTabs(
  page: Page,
  {
    autoApplyFilters,
    parameterAName,
    parameterBName,
  }: {
    autoApplyFilters: boolean;
    parameterAName: string;
    parameterBName: string;
  },
) {
  await checkResetAllFiltersHidden(page);
  await expect(
    filter(page, parameterAName).getByText(parameterAName, { exact: true }),
  ).toBeAttached();
  await expect(
    getDashboardCard(page, 0).getByText("37.65", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    getDashboardCard(page, 0).getByText("116.01", { exact: true }),
  ).toHaveCount(0);

  await addDateFilter(page, parameterAName, "01/01/2027");
  await expect(
    filter(page, parameterAName).getByText("January 1, 2027", { exact: true }),
  ).toBeAttached();
  if (!autoApplyFilters) {
    await applyFilterButton(page).click();
  }
  await checkResetAllFiltersShown(page);
  await expect(
    getDashboardCard(page, 0).getByText("116.01", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    getDashboardCard(page, 0).getByText("37.65", { exact: true }),
  ).toHaveCount(0);

  await page.getByTestId("tab-button-input-wrapper").nth(1).click();
  await checkResetAllFiltersShown(page);
  await expect(
    filter(page, parameterBName).getByText(parameterBName, { exact: true }),
  ).toBeAttached();
  await expect(
    getDashboardCard(page, 0).getByText("18,760", { exact: true }).first(),
  ).toBeVisible();

  await addDateFilter(page, parameterBName, "01/01/2026");
  if (!autoApplyFilters) {
    await applyFilterButton(page).click();
  }
  await checkResetAllFiltersShown(page);
  await expect(
    filter(page, parameterBName).getByText("January 1, 2026", { exact: true }),
  ).toBeAttached();
  await expect(
    getDashboardCard(page, 0).getByText("5", { exact: true }).first(),
  ).toBeVisible();

  await resetAllFilters(page);
  await checkResetAllFiltersHidden(page);
  await expect(
    filter(page, parameterBName).getByText(parameterBName, { exact: true }),
  ).toBeAttached();
  await expect(
    getDashboardCard(page, 0).getByText("18,760", { exact: true }).first(),
  ).toBeVisible();

  await page.getByTestId("tab-button-input-wrapper").nth(0).click();
  await checkResetAllFiltersHidden(page);
  await expect(
    filter(page, parameterAName).getByText(parameterAName, { exact: true }),
  ).toBeAttached();
  await expect(
    getDashboardCard(page, 0).getByText("37.65", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    getDashboardCard(page, 0).getByText("116.01", { exact: true }),
  ).toHaveCount(0);
}

/** Port of the spec-local checkResetAllFiltersToDefaultWorksAcrossTabs. */
export async function checkResetAllFiltersToDefaultWorksAcrossTabs(
  page: Page,
  {
    autoApplyFilters,
    parameterAName,
    parameterBName,
  }: {
    autoApplyFilters: boolean;
    parameterAName: string;
    parameterBName: string;
  },
) {
  await checkResetAllFiltersHidden(page);
  await expect(
    filter(page, parameterAName).getByText("January 5, 2026", { exact: true }),
  ).toBeAttached();
  await expect(
    getDashboardCard(page, 0).getByText("73.99", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    getDashboardCard(page, 0).getByText("116.01", { exact: true }),
  ).toHaveCount(0);

  await updateDateFilter(page, parameterAName, "01/01/2027");
  await expect(
    filter(page, parameterAName).getByText("January 1, 2027", { exact: true }),
  ).toBeAttached();
  if (!autoApplyFilters) {
    await applyFilterButton(page).click();
  }
  await checkResetAllFiltersShown(page);
  await expect(
    getDashboardCard(page, 0).getByText("116.01", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    getDashboardCard(page, 0).getByText("73.99", { exact: true }),
  ).toHaveCount(0);

  await page.getByTestId("tab-button-input-wrapper").nth(1).click();
  await checkResetAllFiltersShown(page);
  await expect(
    filter(page, parameterBName).getByText("January 5, 2026", { exact: true }),
  ).toBeAttached();
  await expect(
    getDashboardCard(page, 0).getByText("4", { exact: true }).first(),
  ).toBeVisible();

  await updateDateFilter(page, parameterBName, "01/01/2026");
  if (!autoApplyFilters) {
    await applyFilterButton(page).click();
  }
  await checkResetAllFiltersShown(page);
  await expect(
    filter(page, parameterBName).getByText("January 1, 2026", { exact: true }),
  ).toBeAttached();
  await expect(
    getDashboardCard(page, 0).getByText("5", { exact: true }).first(),
  ).toBeVisible();

  await resetAllFilters(page);
  await checkResetAllFiltersHidden(page);
  await expect(
    filter(page, parameterBName).getByText("January 5, 2026", { exact: true }),
  ).toBeAttached();
  await expect(
    getDashboardCard(page, 0).getByText("4", { exact: true }).first(),
  ).toBeVisible();

  await page.getByTestId("tab-button-input-wrapper").nth(0).click();
  await checkResetAllFiltersHidden(page);
  await expect(
    filter(page, parameterAName).getByText("January 5, 2026", { exact: true }),
  ).toBeAttached();
  await expect(
    getDashboardCard(page, 0).getByText("73.99", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    getDashboardCard(page, 0).getByText("116.01", { exact: true }),
  ).toHaveCount(0);
}
