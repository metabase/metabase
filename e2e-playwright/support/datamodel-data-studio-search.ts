/**
 * Per-spec helpers for the datamodel-data-studio-search port
 * (e2e/test/scenarios/data-studio/data-model/datamodel-data-studio-search.cy.spec.ts).
 *
 * The bulk of the `cy.H.DataModel.TablePicker` surface this spec needs already
 * lives in shared modules and is imported read-only (PORTING rule 9):
 *   - `support/data-model.ts`            → TablePicker.get{Databases,Database,
 *                                          Schemas,Schema,Tables,Table,
 *                                          SearchInput}, visitDataModel,
 *                                          resetTestTableMultiSchema
 *   - `support/datamodel-data-studio.ts` → getFilterForm / openFilterPopover /
 *                                          selectFilterOption / applyFilters
 * Only the pieces neither module carries live here.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { tablePicker } from "./admin-datamodel";
import { TablePicker } from "./data-model";
import { getFilterForm } from "./datamodel-data-studio";

// === H.DataModel.TablePicker pieces not present in the shared modules =======

/**
 * Port of `DataModel.TablePicker.getDatabaseCheckbox(name)` —
 * `getTablePickerDatabase(name).find('input[type="checkbox"]')`.
 */
export function getDatabaseCheckbox(page: Page, name: string): Locator {
  return TablePicker.getDatabase(page, name).locator('input[type="checkbox"]');
}

/**
 * Port of `DataModel.TablePicker.getSchemaCheckbox(name)` —
 * `getTablePickerSchema(name).find('input[type="checkbox"]')`.
 */
export function getSchemaCheckbox(page: Page, name: string): Locator {
  return TablePicker.getSchema(page, name).locator('input[type="checkbox"]');
}

/**
 * Port of `DataModel.TablePicker.getDatabaseToggle(name)` —
 * `getTablePickerDatabase(name).find("[aria-expanded]")`.
 */
export function getDatabaseToggle(page: Page, name: string): Locator {
  return TablePicker.getDatabase(page, name).locator("[aria-expanded]");
}

/**
 * Port of `DataModel.TablePicker.getSchemaToggle(name)` —
 * `getTablePickerSchema(name).find("[aria-expanded]")`.
 */
export function getSchemaToggle(page: Page, name: string): Locator {
  return TablePicker.getSchema(page, name).locator("[aria-expanded]");
}

/**
 * The spec's repeated `cy.findByRole("heading", { name: /N tables selected/i })`.
 *
 * Kept as a case-insensitive regex, exactly as upstream wrote it. Note that
 * `/2 tables selected/i` is a SUBSTRING match on the accessible name in both
 * harnesses, so it would also match a hypothetical "12 tables selected" — that
 * is upstream's own looseness and is ported verbatim rather than tightened.
 * Every count this spec asserts is <= 4, so no such collision is reachable.
 */
export function selectedTablesHeading(page: Page, count: number): Locator {
  return page.getByRole("heading", {
    name: new RegExp(`${count} tables selected`, "i"),
  });
}

/** The picker's "No tables found" empty state (`SearchNew.tsx`). */
export function noTablesFound(page: Page): Locator {
  return tablePicker(page).getByText("No tables found", { exact: true });
}

// === positive anchors ======================================================

/**
 * 🔴 THE anchor for this spec.
 *
 * Every result assertion here — the `have.length` counts, the "No tables found"
 * empty state, the `not.exist` heading checks — is a statement about what the
 * table-picker search returned. The picker is backed by
 * `useListTablesQuery({ term, ... })` (`SearchNew.tsx`), i.e.
 * `GET /api/table?term=<query>&...`, debounced by `SEARCH_DEBOUNCE_DURATION`
 * (500 ms, `TablePicker.tsx`).
 *
 * Without waiting on that response an absence assertion can be satisfied by the
 * PRE-FETCH state. Register this BEFORE typing (PORTING rule 2) and await it
 * before asserting.
 *
 * `term` is matched exactly so a response for an intermediate debounce value
 * (or for a *previous* query still in flight) cannot satisfy the wait.
 */
export function waitForTableSearch(page: Page, term: string): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/table" &&
      url.searchParams.get("term") === term
    );
  });
}

/**
 * Type into the search input the way `cy.type()` does — APPENDING to whatever
 * is already there (the spec relies on this at `type("a")` … `type("c")` →
 * "ac") — and await the search response for the resulting term.
 *
 * `pressSequentially` rather than `fill` for two reasons: `fill` replaces
 * instead of appending, and it sets the value in one shot without per-character
 * input events. All the strings here are short enough to land well inside the
 * 500 ms debounce, so exactly one request is issued per call.
 *
 * 🔴 The `press("End")` is load-bearing and was found by measurement, not by
 * reasoning. `cy.type()` always appends at the END of the existing value;
 * Playwright's `pressSequentially` types at the CURRENT caret, which after
 * focusing a non-empty input sits at offset 0. Without it, `type("c")` on a
 * field holding "a" produced **"ca"** (read off the failure snapshot), so the
 * spec searched the wrong term and the `term=ac` wait timed out. On an empty
 * input `End` is a no-op, so every other call site is unaffected.
 */
export async function typeSearch(page: Page, text: string, term = text) {
  const search = waitForTableSearch(page, term);
  const input = TablePicker.getSearchInput(page);
  await input.press("End");
  await input.pressSequentially(text);
  await search;
}

/**
 * `cy.clear().type(text)` — clear, then type, awaiting the search for `text`.
 *
 * Clearing drops `debouncedQuery` to "" only if the 500 ms debounce elapses
 * between the clear and the typing; if it does, `TablePicker.tsx` swaps
 * `SearchNew` out for the plain `Tree` and back. Either way the terminal state
 * is a fetch for `text`, which is what we anchor on.
 */
/**
 * Port of `TablePicker.selectFilterOption(...)` **as the spec calls it the
 * first time** — inside `cy.findByTestId("table-picker-filter").within(...)`.
 *
 * The shared port in `support/datamodel-data-studio.ts` looks the field's
 * textbox up on `page`, unscoped. That is faithful to the helper in isolation
 * but NOT to this call site: upstream's surrounding `within()` scopes the
 * `cy.findByRole("textbox", ...)` to the filter form. It matters here because
 * the `data-model` pane renders its OWN "Visibility layer" select (the
 * TableSection metadata editor, `metadata/components/LayerInput.tsx`) whenever
 * a table is open — measured: 2 matches, strict-mode violation. Scoping to the
 * filter form reproduces upstream's node set exactly.
 *
 * The shared module is imported read-only (PORTING rule 9), hence the local
 * variant rather than an edit there.
 */
export async function selectFilterOptionInForm(
  page: Page,
  fieldLabel: string,
  optionLabel: string,
) {
  const form = getFilterForm(page);
  await form.getByRole("textbox", { name: fieldLabel, exact: true }).click();
  await form
    .getByRole("option", { name: new RegExp(escapeRegExp(optionLabel)) })
    .click();
}

/**
 * Port of `TablePicker.selectFilterOption(...)` **as the spec calls it the
 * SECOND time** (upstream line 205) — deliberately UNSCOPED, because at that
 * point it is not driving a filter at all.
 *
 * Measured state at that call: `table-picker-filter` count **0** (the popover
 * closed itself — `FilterPopover`'s `onSubmit` calls `close()`), `table-section`
 * count **0**, and yet exactly **1** "Visibility layer" textbox on the page,
 * whose dropdown offers Hidden/Internal/Final. That control is the picker's
 * BULK-ATTRIBUTE editor, rendered because two tables are selected.
 *
 * So upstream is reusing a helper named `selectFilterOption` to perform a bulk
 * metadata WRITE: it sets the two selected tables' visibility layer to "Final",
 * which drops them out of the still-active "Internal" filter — hence the
 * "No tables found" and the cleared selection heading that follow. The helper's
 * name is a red herring; the behaviour under test is real. Ported to the
 * behaviour, with this note rather than a rename.
 */
export async function setBulkVisibilityLayer(page: Page, optionLabel: string) {
  await page
    .getByRole("textbox", { name: "Visibility layer", exact: true })
    .click();
  await page
    .getByRole("option", { name: new RegExp(escapeRegExp(optionLabel)) })
    .first()
    .click();
}

/**
 * The bulk metadata write the above triggers.
 *
 * Traced, not guessed — an earlier guess of `PUT /api/table` (the
 * `useUpdateTableListMutation` endpoint) was WRONG and timed out: that hook
 * backs `BulkTableVisibilityToggle`, a different control. The bulk-attribute
 * editor is `TableSection/components/TableAttributesEditBulk.tsx`, which uses
 * `useEditTablesMutation` → `POST /api/data-studio/table/edit`
 * (`frontend/src/metabase/api/table.ts:218`).
 *
 * Register before the option click and await it, so the "No tables found" and
 * heading-absent assertions that follow are anchored on the write having
 * actually landed. Upstream awaits nothing here; this is a declared
 * STRENGTHENING, without which those two assertions could be read off the
 * pre-write render.
 */
export function waitForBulkTableUpdate(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/data-studio/table/edit",
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function clearAndTypeSearch(page: Page, text: string) {
  const search = waitForTableSearch(page, text);
  await TablePicker.getSearchInput(page).clear();
  await TablePicker.getSearchInput(page).pressSequentially(text);
  await search;
}
