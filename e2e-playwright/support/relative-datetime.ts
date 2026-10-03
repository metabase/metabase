/**
 * Helpers for the relative-datetime spec port:
 * - H.relativeDatePicker (e2e/support/helpers/e2e-relative-date-picker-helpers.js)
 * - H.clickActionsPopover (e2e-ui-elements-helpers.js)
 * - the spec-local helpers from relative-datetime.cy.spec.js (nativeSQL,
 *   openCreatedAt, addStartingFrom, set*Value/Unit, withStartingFrom)
 * - addToDate: replaces the spec's dayjs().utc().add(n, unit) arithmetic
 *   (dayjs is not a dependency of this spike; only single-unit adds are
 *   needed). Month-based adds clamp the day-of-month like dayjs does.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { createNativeQuestion } from "./dashboard-management";
import { waitForDataset } from "./nested-questions";
import { tableHeaderClick } from "./notebook";
import { popover, visitQuestion } from "./ui";

export const STARTING_FROM_UNITS = [
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
  "quarters",
  "years",
] as const;

export type RelativeUnit = (typeof STARTING_FROM_UNITS)[number];

const MS_PER_UNIT: Partial<Record<RelativeUnit, number>> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 7 * 86_400_000,
};

const MONTHS_PER_UNIT: Partial<Record<RelativeUnit, number>> = {
  months: 1,
  quarters: 3,
  years: 12,
};

/** UTC-calendar equivalent of dayjs().utc().add(amount, unit). */
export function addToDate(base: Date, amount: number, unit: RelativeUnit): Date {
  const ms = MS_PER_UNIT[unit];
  if (ms !== undefined) {
    return new Date(base.getTime() + amount * ms);
  }
  const months = MONTHS_PER_UNIT[unit];
  if (months === undefined) {
    throw new Error(`Unsupported unit: ${unit}`);
  }
  const day = base.getUTCDate();
  const result = new Date(base);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + amount * months);
  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, daysInTargetMonth));
  return result;
}

/** Port of H.clickActionsPopover. */
export function clickActionsPopover(page: Page): Locator {
  return page.getByTestId("click-actions-popover");
}

/**
 * Port of the spec's nativeSQL: create + visit a native question selecting
 * the given timestamps as "testcol", then explore its results as an ad-hoc
 * query.
 */
export async function nativeSQL(page: Page, api: MetabaseApi, values: Date[]) {
  const queries = values.map(
    (value) => `SELECT '${value.toISOString()}'::timestamp as "testcol"`,
  );

  const { id } = await createNativeQuestion(api, {
    name: "datetime",
    native: { query: queries.join(" UNION ALL ") },
  });
  await visitQuestion(page, id);

  const dataset = waitForDataset(page);
  await page.getByText("Explore results", { exact: true }).click();
  await dataset;
}

/** Port of the spec's openCreatedAt: header click → relative date picker. */
export async function openCreatedAt(page: Page, tab?: "Previous" | "Next") {
  await tableHeaderClick(page, "Created At");
  const container = clickActionsPopover(page);
  await container.getByText("Filter by this column", { exact: true }).click();
  await container.getByText("Relative date range…", { exact: true }).click();
  if (tab) {
    await container.getByText(tab, { exact: true }).click();
  }
}

/** Port of the spec's addStartingFrom: reveal the "Starting from" controls. */
export async function addStartingFrom(page: Page) {
  await popover(page).getByLabel("Starting from…").click();
}

/** Port of the spec's setRelativeDatetimeUnit (exact string or regex). */
export async function setRelativeDatetimeUnit(page: Page, unit: string | RegExp) {
  await page.getByRole("textbox", { name: "Unit", exact: true }).click();
  const listbox = page.getByRole("listbox");
  const option =
    typeof unit === "string"
      ? listbox.getByRole("option", { name: unit, exact: true })
      : listbox.getByRole("option", { name: unit });
  await option.click();
}

/** Port of the spec's setRelativeDatetimeValue. */
export async function setRelativeDatetimeValue(page: Page, value: number) {
  const input = page.getByLabel("Interval", { exact: true });
  await input.click();
  await input.fill(String(value));
  await input.blur();
}

/** Port of the spec's setStartingFromValue. */
export async function setStartingFromValue(page: Page, value: number) {
  const input = page.getByLabel("Starting from interval", { exact: true });
  await input.click();
  await input.fill(String(value));
  await input.blur();
}

/**
 * Units have different labels depending on the value and time direction,
 * e.g. "days" for the interval and "days ago" / "days from now" for the
 * offset — match on the prefix like the Cypress helper.
 */
function unitOptionRegExp(unitName: string): RegExp {
  return new RegExp(`^${unitName}`, "i");
}

/** Port of H.relativeDatePicker.setValue. */
export async function setPickerValue(
  page: Page,
  { value, unit }: { value: number; unit: string },
  container: Locator,
) {
  await container.getByLabel("Interval", { exact: true }).fill(String(value));
  await container.getByRole("textbox", { name: "Unit", exact: true }).click();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: unitOptionRegExp(unit) })
    .click();
}

/** Port of H.relativeDatePicker.addStartingFrom. */
export async function addPickerStartingFrom(
  page: Page,
  { value, unit }: { value: number; unit: string },
  container: Locator,
) {
  await container.getByLabel("Starting from…").click();
  await container
    .getByLabel("Starting from interval", { exact: true })
    .fill(String(value));
  await container
    .getByRole("textbox", { name: "Starting from unit", exact: true })
    .click();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: unitOptionRegExp(unit) })
    .click();
}

/**
 * Port of the spec's withStartingFrom: build a Previous/Next filter with an
 * offset on the "testcol" column and apply it.
 */
export async function withStartingFrom(
  page: Page,
  dir: "Previous" | "Next",
  [num, unit]: [number, RelativeUnit],
  [startNum, startUnit]: [number, RelativeUnit],
) {
  await tableHeaderClick(page, "testcol");
  const container = clickActionsPopover(page);
  await container.getByText("Filter by this column", { exact: true }).click();
  await container.getByText("Relative date range…", { exact: true }).click();
  await container.getByText(dir, { exact: true }).click();

  await setPickerValue(page, { value: num, unit }, container);
  await addPickerStartingFrom(
    page,
    {
      value: startNum,
      unit: startUnit + (dir === "Previous" ? " ago" : " from now"),
    },
    container,
  );

  const dataset = waitForDataset(page);
  await container.getByText("Add filter", { exact: true }).click();
  await dataset;
}
