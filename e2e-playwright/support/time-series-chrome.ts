/**
 * Helpers for the time-series footer "chrome" — the date-range/bucket stepper
 * shown below a time-series question (the `timeseries-filter-button` and the
 * `date-filter-picker` it opens).
 *
 * New helpers for tests/time-series-chrome.spec.ts. Read-only imports of the
 * shared surface (findByDisplayValue).
 */
import type { Locator, Page } from "@playwright/test";

import { findByDisplayValue } from "./filters-repros";

/**
 * The `date-filter-picker` container. Both the timeseries chrome popover
 * (SimpleDateFilterPicker) and the filter-pill's full picker (DateFilterPicker)
 * render it with the same test id, but only one is open at a time.
 */
export function dateFilterPicker(page: Page): Locator {
  return page.getByTestId("date-filter-picker");
}

/**
 * Port of the spec-local updateOperator(from, to): open the operator select
 * inside the date-filter-picker (matched on its current display value) and
 * pick the target option from the listbox.
 */
export async function updateOperator(
  page: Page,
  from: string,
  to: string,
): Promise<void> {
  await (await findByDisplayValue(dateFilterPicker(page), from)).click();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: to, exact: true })
    .click();
}
