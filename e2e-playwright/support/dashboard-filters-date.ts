/**
 * Helpers for the dashboard-filters-date spec port
 * (dashboard-filters-date.cy.spec.js).
 *
 * Ports of:
 * - the shared DASHBOARD_DATE_FILTERS fixture
 *   (e2e/test/scenarios/dashboard-filters/shared/dashboard-filters-date.js), and
 * - the date-picker widget helpers the Cypress spec pulls from
 *   e2e/test/scenarios/native-filters/helpers/e2e-date-filter-helpers.js
 *   (setMonthAndYear / setQuarterAndYear / setSingleDate / setTime /
 *   setDateRange / setRelativeDate / setAdHocFilter), plus the spec-local
 *   `dateFilterSelector` switch.
 *
 * Date-picker widget notes (PORTING date-picker patterns):
 * - Text date inputs take real keystrokes (`pressSequentially`, not `fill`) so
 *   the masked inputs parse each segment — mirrors addDateFilter in
 *   support/dashboard-filters-reset-clear.ts.
 * - `currentYearString` uses `new Date()`; runs must set TZ=US/Pacific to match
 *   CI (this whole spec is date-asserting).
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { selectDropdown } from "./dashboard";
import { popover } from "./ui";

/**
 * Port of DASHBOARD_DATE_FILTERS
 * (e2e/test/scenarios/dashboard-filters/shared/dashboard-filters-date.js).
 */
export const DASHBOARD_DATE_FILTERS = {
  "Month and Year": {
    value: { month: "Nov", year: "2025" },
    representativeResult: "85.88",
  },
  "Quarter and Year": {
    value: { quarter: "Q2", year: "2025" },
    representativeResult: "44.43",
  },
  "Single Date": {
    value: "05/23/2025",
    representativeResult: "49.54",
  },
  "Date Range": {
    value: { startDate: "05/25/2025", endDate: "06/01/2025" },
    representativeResult: "75.41",
  },
  "All Options": {
    value: { timeBucket: "years" },
    representativeResult: "79.37", // this may change every year
  },
} as const;

const currentYearString = new Date().getFullYear().toString();

/** Port of DateFilter.setMonthAndYear. */
export async function setMonthAndYear(
  page: Page,
  { month, year }: { month: string; year: string },
) {
  const pop = popover(page);
  await pop.getByText(currentYearString, { exact: true }).click();
  await pop.getByText(year, { exact: true }).click();
  await pop.getByText(month, { exact: true }).click();
}

/** Port of DateFilter.setQuarterAndYear. */
export async function setQuarterAndYear(
  page: Page,
  { quarter, year }: { quarter: string; year: string },
) {
  const pop = popover(page);
  await pop.getByText(currentYearString, { exact: true }).click();
  await pop.getByText(year, { exact: true }).click();
  await pop.getByText(quarter, { exact: true }).click();
}

/** Port of DateFilter.setSingleDate. */
export async function setSingleDate(page: Page, date: string) {
  const input = popover(page).getByRole("textbox", { name: "Date", exact: true });
  await input.clear();
  await input.pressSequentially(date);
  await input.blur();
}

/**
 * Port of DateFilter.setTime.
 * getByLabel("Time") is a substring match that also hits the "Remove time"
 * button — scope to the textbox role.
 */
export async function setTime(
  page: Page,
  { hours, minutes }: { hours: number; minutes: number },
) {
  const pop = popover(page);
  await pop.getByText("Add time", { exact: true }).click();
  // A native <input type="time"> — pressSequentially leaves the segmented
  // control at 00:00 (a 1-minute filter window that matches nothing); fill()
  // sets the value directly. Distinct from the masked date textboxes above,
  // which do need real keystrokes.
  const input = pop.getByRole("textbox", { name: "Time", exact: true });
  await input.fill(
    `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
  );
}

/** Port of DateFilter.setDateRange. */
export async function setDateRange(
  page: Page,
  { startDate, endDate }: { startDate: string; endDate: string },
) {
  const pop = popover(page);
  const start = pop.getByRole("textbox", { name: "Start date", exact: true });
  await start.clear();
  await start.pressSequentially(startDate);
  await start.blur();
  const end = pop.getByRole("textbox", { name: "End date", exact: true });
  await end.clear();
  await end.pressSequentially(endDate);
  await end.blur();
}

/** Port of DateFilter.setRelativeDate. */
export async function setRelativeDate(page: Page, term: string) {
  await popover(page).getByText(term, { exact: true }).click();
}

type AdHocFilter = {
  condition?: string;
  quantity?: number | string;
  timeBucket?: string;
  includeCurrent?: boolean;
};

/** Port of DateFilter.setAdHocFilter. */
export async function setAdHocFilter(
  page: Page,
  {
    condition,
    quantity,
    timeBucket,
    includeCurrent = false,
  }: AdHocFilter = {},
  buttonLabel = "Add filter",
) {
  const pop = popover(page);
  await pop.getByText("Relative date range…", { exact: true }).click();

  await pop
    .getByText(condition ?? "Previous", { exact: true })
    .click({ force: true });

  if (quantity) {
    const interval = pop.getByLabel("Interval");
    await interval.clear();
    await interval.pressSequentially(String(quantity));
  }

  if (timeBucket) {
    const unit = pop.getByRole("textbox", { name: "Unit" });
    await expect(unit).toHaveValue("days");
    await unit.click();
    await selectDropdown(page).getByText(timeBucket, { exact: true }).click();
  }

  if (includeCurrent) {
    await pop.getByLabel(/Include/).click();
  }

  await pop.getByRole("button", { name: buttonLabel, exact: true }).click();
}

/**
 * Port of the spec-local dateFilterSelector switch: apply a filter value in the
 * open filter-widget popover according to its type.
 */
export async function dateFilterSelector(
  page: Page,
  {
    filterType,
    filterValue,
  }: {
    filterType: keyof typeof DASHBOARD_DATE_FILTERS | "Relative Date";
    // The value shapes vary by filter type; the switch narrows them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filterValue: any;
  },
) {
  switch (filterType) {
    case "Month and Year":
      await setMonthAndYear(page, filterValue);
      break;

    case "Quarter and Year":
      await setQuarterAndYear(page, filterValue);
      break;

    case "Single Date":
      await setSingleDate(page, filterValue);
      await setTime(page, { hours: 9, minutes: 27 });
      await popover(page).getByText("Add filter", { exact: true }).click();
      break;

    case "Date Range":
      await setDateRange(page, filterValue);
      await popover(page).getByText("Add filter", { exact: true }).click();
      break;

    case "Relative Date":
      await setRelativeDate(page, filterValue);
      break;

    case "All Options":
      await setAdHocFilter(page, filterValue);
      break;

    default:
      throw new Error("Wrong filter type!");
  }
}
