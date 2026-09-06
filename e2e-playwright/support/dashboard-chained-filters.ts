/**
 * Helpers for the dashboard-chained-filters port
 * (e2e/test/scenarios/dashboard-filters/dashboard-chained-filters.cy.spec.js).
 *
 * Everything else the spec needs already exists in shared modules
 * (dashboard.ts, dashboard-core.ts, dashboard-cards.ts, schema-viewer.ts,
 * drillthroughs.ts, ui.ts) and is imported from there — per PORTING rule 9
 * this module only holds what is genuinely spec-local.
 */
import type { Locator, Page } from "@playwright/test";

import { selectDropdown } from "./dashboard";

export type HasFieldValues = "search" | "list";

/**
 * Port of the spec-local `valuesWidget()`:
 *
 *   has_field_values === "search" ? H.selectDropdown()
 *                                 : cy.findByTestId("field-values-widget")
 *
 * The two widget types render the offered values in different containers: the
 * search-backed one in a Mantine listbox inside the popover, the list-backed
 * one in the FieldValuesWidget (FieldValuesWidget.tsx:427).
 */
export function valuesWidget(page: Page, mode: HasFieldValues): Locator {
  return mode === "search"
    ? selectDropdown(page)
    : page.getByTestId("field-values-widget");
}

/**
 * The gate message for the `@external` test — the writable postgres QA
 * container + its `postgres-writable` snapshot (PORTING rule 6).
 */
export const WRITABLE_PG_SKIP_REASON =
  "Requires the writable postgres QA container + the postgres-writable snapshot (set PW_QA_DB_ENABLED)";
