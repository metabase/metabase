/**
 * Helpers for the Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-text-category.cy.spec.js
 *
 * Everything else the spec needs (setFilter / saveDashboard / filterWidget /
 * selectDashboardFilter / getDashboardCard from dashboard.ts, clearFilterWidget
 * from dashboard-parameters.ts, toggleRequiredParameter / toggleFilterWidgetValues
 * / resetFilterWidgetToDefault / ensureDashboardCardHasText / createQuestionAndDashboard)
 * is imported read-only from the shared modules — this file only carries what
 * had no home yet.
 *
 * The field-filter helpers (applyFilterByType / selectFilterValueFromList /
 * addWidgetStringFilter / selectDefaultValueFromPopover) are ports of
 * e2e/test/scenarios/native-filters/helpers/e2e-field-filter-helpers.js. The
 * one deliberate deviation from the shared addWidgetStringFilter port
 * (actions-on-dashboards.ts, which uses fill()): value entry here goes through
 * pressSequentially. The "Contains"/"Starts with"/… multi-value widgets are
 * token fields that split on the typed comma, so "oo,aa" must be typed
 * keystroke-by-keystroke to produce two tokens — fill() sets the value in one
 * shot and yields a single token (see PORTING rule 5).
 */
import type { Locator, Page } from "@playwright/test";

import { editBar } from "./dashboard";
import { popover } from "./ui";

/**
 * Port of DASHBOARD_TEXT_FILTERS
 * (e2e/test/scenarios/dashboard-filters/shared/dashboard-filters-text-category.js).
 *
 * The upstream data carries a typo — `negativeASsertion` (capital S) on 7 of the
 * 10 entries. The spec destructures the correctly-spelled `negativeAssertion`,
 * so on those 7 entries the negative ("not.contain") assertion silently never
 * runs. Reproduced verbatim (typo and all) to keep the port faithful; the port
 * guards the negative assertion on presence, matching Cypress's
 * `should("not.contain", undefined)` no-op. See findings.
 */
export type TextFilter = {
  operator: string;
  single?: boolean;
  value: string;
  representativeResult: string;
  negativeAssertion?: string;
  /** upstream typo — never read; keeps the data shape byte-faithful */
  negativeASsertion?: string;
};

export const DASHBOARD_TEXT_FILTERS: TextFilter[] = [
  {
    operator: "Is",
    single: true,
    value: "Organic",
    representativeResult: "39.58",
  },
  {
    operator: "Is not",
    single: true,
    value: "Organic",
    representativeResult: "37.65",
  },
  // It is important to keep multiple values as a single string in the value field.
  {
    operator: "Contains",
    value: "oo,aa",
    representativeResult: "148.23",
    negativeAssertion: "37.65",
  },
  {
    operator: "Contains",
    single: true,
    value: '"oo,aa"',
    representativeResult: "No results",
    negativeAssertion: "148.23",
  },
  {
    operator: "Does not contain",
    value: "oo,tt",
    representativeResult: "39.58",
    negativeAssertion: "37.65",
  },
  {
    operator: "Does not contain",
    single: true,
    value: '"oo,tt"',
    representativeResult: "37.65",
    negativeASsertion: "39.58",
  },
  {
    operator: "Starts with",
    value: "A,b",
    representativeResult: "85.72",
    negativeASsertion: "70.15",
  },
  {
    operator: "Starts with",
    single: true,
    value: '"A,b"',
    representativeResult: "No results",
    negativeASsertion: "85.72",
  },
  {
    operator: "Ends with",
    value: "e,s",
    representativeResult: "47.68",
    negativeASsertion: "127.88",
  },
  {
    operator: "Ends with",
    single: true,
    value: '"e,s"',
    representativeResult: "No results",
    negativeASsertion: "47.68",
  },
];

/** Port of H.dashboardSaveButton (e2e-dashboard-helpers.ts). */
export function dashboardSaveButton(page: Page): Locator {
  return editBar(page).getByRole("button", { name: "Save", exact: true });
}

/**
 * Port of FieldFilter.selectFilterValueFromList: pick a value from the
 * field-values list widget. cy.findByText is exact; the optional search box
 * gets real keystrokes + Enter.
 */
export async function selectFilterValueFromList(
  page: Page,
  value: string,
  {
    addFilter = true,
    buttonLabel = "Add filter",
    search = false,
  }: { addFilter?: boolean; buttonLabel?: string; search?: boolean } = {},
) {
  const pop = popover(page).first();
  if (search) {
    await pop.getByPlaceholder("Search the list").pressSequentially(value);
    await pop.getByPlaceholder("Search the list").press("Enter");
  }
  await pop.getByText(value, { exact: true }).click();
  if (addFilter) {
    await pop.getByRole("button", { name: buttonLabel, exact: true }).click();
  }
}

/**
 * Port of FieldFilter.addWidgetStringFilter: type the value into the first
 * non-hidden input of the first open popover, then click the confirm button.
 * pressSequentially (not fill) so the token fields split "oo,aa" on the comma.
 */
export async function addWidgetStringFilter(
  page: Page,
  value: string,
  { buttonLabel = "Add filter" }: { buttonLabel?: string } = {},
) {
  const pop = popover(page).first();
  const input = pop.locator("input:not([type=hidden])").first();
  await input.pressSequentially(value);
  await pop.getByRole("button", { name: buttonLabel, exact: true }).click();
}

/** Port of FieldFilter.applyFilterByType: list picker for Is/Is not, else text. */
export async function applyFilterByType(
  page: Page,
  filter: string,
  value: string,
  {
    buttonLabel = "Add filter",
    search = false,
  }: { buttonLabel?: string; search?: boolean } = {},
) {
  if (["Is", "Is not"].includes(filter)) {
    await selectFilterValueFromList(page, value, { buttonLabel, search });
  } else {
    await addWidgetStringFilter(page, value, { buttonLabel });
  }
}

/**
 * Port of FieldFilter.selectDefaultValueFromPopover: open the "Default value"
 * picker (the label's next sibling), then pick a value from the list.
 */
export async function selectDefaultValueFromPopover(
  page: Page,
  value: string,
  { buttonLabel = "Add filter" }: { buttonLabel?: string } = {},
) {
  await clickDefaultValueToggle(page);
  await selectFilterValueFromList(page, value, { buttonLabel });
}

/**
 * Port of the `cy.findByText("Default value").next().click()` idiom. The
 * SettingLabel's next sibling is the ParameterValueWidget wrapper
 * (`div[aria-labelledby="default-value-label"]`) — targeted directly here,
 * which also sidesteps the label text changing to "Default value (required)"
 * once the parameter is marked required.
 */
export async function clickDefaultValueToggle(page: Page) {
  await page.locator('[aria-labelledby="default-value-label"]').click();
}

/**
 * Register BEFORE the triggering action; await after (PORTING rule 2). Matches
 * the Cypress `@dashcardQuery${id}` alias — with a single dashcard on the
 * dashboard there is nothing to disambiguate.
 */
export function waitForDashcardQuery(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(
        new URL(response.url()).pathname,
      ),
  );
}
