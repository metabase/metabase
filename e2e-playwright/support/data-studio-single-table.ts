/**
 * Per-spec helpers for the data-studio single-table port
 * (e2e/test/scenarios/data-studio/data-model/data-studio-single-table.cy.spec.ts).
 *
 * New module per PORTING rule 9. Every shared support module below is imported
 * READ-ONLY — in particular `support/data-model.ts` is NOT edited, and its
 * `verifyAndCloseToast` is deliberately NOT used (see `closeUndoToast` below).
 *
 * Snowplow vantage (decided from the call site, per the brief): the spec's one
 * assertion is `data_studio_table_published`, emitted by an FE `trackSimpleEvent`
 * at `frontend/src/metabase/common/data-studio/analytics.ts:13`. That is a
 * FRONTEND event, so the correct seam is the BROWSER BOUNDARY
 * (`installSnowplowCapture`), not the per-slot collector — the collector's
 * preflight omits `Access-Control-Allow-Credentials` and so is blind to FE
 * events, and its persistent queue offset would let this assertion pass on a
 * predecessor's event. Neither hazard applies at the boundary.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { expect } from "./fixtures";
import { queryWritableDB } from "./schema-viewer";
import { escapeRegExp } from "./text";
import { popover } from "./ui";

// === selects (port of e2e/support/helpers/e2e-ui-select.ts) ================

/**
 * Port of `H.selectHasValue(label, value)`:
 * `cy.findByRole("textbox", { name: label }).should("have.value", value)`.
 *
 * Returns the input so callers can chain `.click()` like upstream does.
 */
export async function selectHasValue(
  page: Page,
  label: string,
  value: string,
): Promise<Locator> {
  const input = page.getByRole("textbox", { name: label, exact: true });
  await expect(input).toHaveValue(value);
  return input;
}

/**
 * Port of `H.selectIsDisabled(label)`:
 * `cy.findByRole("textbox", { name: label }).should("have.attr", "disabled")`.
 *
 * Kept as an ATTRIBUTE-PRESENCE assertion rather than `toBeDisabled()`.
 * `toBeDisabled()` also passes when an ancestor `<fieldset disabled>` disables
 * the control without the attribute being on the input itself, so it is
 * strictly weaker than what upstream asserts.
 */
export async function selectIsDisabled(page: Page, label: string) {
  await expect(
    page.getByRole("textbox", { name: label, exact: true }),
  ).toHaveAttribute("disabled", /.*/);
}

/** Port of `H.selectDropdown()` — `popover().findByRole("listbox")`. */
export function selectDropdown(page: Page): Locator {
  return popover(page).getByRole("listbox");
}

/**
 * Port of `H.selectDropdown().contains(label).click()`.
 *
 * Two deviations forced by Playwright/Mantine, both already established by the
 * sibling bulk-table port:
 *  - a Mantine `Select` option's inner text div is not the click target, so the
 *    `role="option"` row is clicked instead;
 *  - `cy.contains` is a case-sensitive substring returning the FIRST hit, so the
 *    name is matched as an escaped substring regex and `.first()` mirrors that.
 */
export async function clickSelectOption(page: Page, label: string) {
  await selectDropdown(page)
    .getByRole("option", { name: new RegExp(escapeRegExp(label)) })
    .first()
    .click();
}

/** `selectHasValue(...).click()` + `selectDropdown().contains(...).click()` —
 * the pair the spec repeats six times. */
export async function setSelectValue(
  page: Page,
  label: string,
  currentValue: string,
  option: string,
) {
  const input = await selectHasValue(page, label, currentValue);
  await input.click();
  await clickSelectOption(page, option);
}

// === toasts ===============================================================

/** Port of `H.undoToast()` — `cy.findByTestId("toast-undo")` (SINGULAR). */
export function undoToast(page: Page): Locator {
  return page.getByTestId("toast-undo");
}

/** Port of `H.undoToastListContainer()` — `cy.findByTestId("undo-list")`. */
export function undoToastListContainer(page: Page): Locator {
  return page.getByTestId("undo-list");
}

/**
 * LOCAL replacement for `Shared.verifyAndCloseToast` / the spec's
 * `H.undoToast().findByRole("img", { name: /Close/i }).click()`.
 *
 * Why a local one rather than the shared `support/data-model.ts` helper: the
 * shared helper is a MEASURED strict-mode violation, and the mechanism is
 * `frontend/src/metabase/common/components/UndoListing.tsx:203` —
 * `const Group = "Cypress" in window ? MockGroup : TransitionGroup`. Toast EXIT
 * transitions are short-circuited ONLY under Cypress, so upstream's singular
 * `findByTestId("toast-undo")` never sees a dismissed toast, while Playwright
 * gets the real `TransitionGroup` and a just-dismissed toast lingers in the DOM
 * for the length of its exit animation. A second toast arriving in that window
 * makes the singular locator resolve to two nodes.
 *
 * The fix is a WAIT, not a loosening: `.first()` would silently pick whichever
 * toast happened to be on top (and would mask a genuine two-toast bug), so
 * instead we
 *   1. wait until exactly ONE toast is present — upstream's own precondition,
 *      since `findByTestId` is singular and fails on multiple;
 *   2. click its close icon;
 *   3. gate on `toHaveCount(0)` so the exit transition has actually finished
 *      before the next step can observe a stale node.
 */
export async function closeUndoToast(page: Page) {
  const toast = undoToast(page);
  await expect(toast).toHaveCount(1);
  await toast.getByRole("img", { name: /close/i }).click();
  // Bounded deliberately. An undo toast ALSO auto-expires (~4-5s), so an
  // unbounded `toHaveCount(0)` passes even if the click never lands — measured:
  // mutation M6 removed the click and the test still passed, but took 19.4s
  // instead of 6.5s, i.e. it was waiting out three auto-dismiss timers. The
  // exit transition is ~300ms, so 3s is ~10x headroom while still being far
  // below the auto-expiry window; this makes the gate prove the CLICK worked
  // rather than merely that the toast eventually went away.
  await expect(toast).toHaveCount(0, { timeout: 3_000 });
}

// === response waits (PORTING rule 2: register before the trigger) =========

function byMethodAndPath(
  method: string,
  pathname: string,
): (response: Response) => boolean {
  return (response) =>
    response.request().method() === method &&
    new URL(response.url()).pathname === pathname;
}

/** `@publishTables` — `POST /api/ee/data-studio/table/publish-tables`. */
export function waitForPublishTables(page: Page): Promise<Response> {
  return page.waitForResponse(
    byMethodAndPath("POST", "/api/ee/data-studio/table/publish-tables"),
  );
}

/** `@unpublishTables` — `POST /api/ee/data-studio/table/unpublish-tables`. */
export function waitForUnpublishTables(page: Page): Promise<Response> {
  return page.waitForResponse(
    byMethodAndPath("POST", "/api/ee/data-studio/table/unpublish-tables"),
  );
}

/** `@metadata` — `GET /api/table/:id/query_metadata`. */
export function waitForTableMetadata(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/table\/\d+\/query_metadata$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

// === library ==============================================================

/** Port of `H.DataStudio.Library.allTableItems()` —
 * `libraryPage().findAllByTestId("table-name")`. */
export function allLibraryTableItems(page: Page): Locator {
  return page.getByTestId("library-page").getByTestId("table-name");
}

// === fixtures =============================================================

/**
 * Port of `H.resetTestTable({ type: "postgres", table: "many_schemas" })`
 * (cy.task("resetTable") -> e2e/support/test_tables.js `many_schemas`),
 * transcribed to plain SQL against the shared writable postgres container.
 *
 * Defined here rather than imported from `support/data-studio-bulk-table.ts` so
 * this port does not couple to another spec's per-spec module.
 *
 * ⚠️ This fixture is one source of the `Schema A`…`Schema Z` debris in the
 * shared writable container: upstream never drops the schemas, and our harness
 * has no `resetWritableDb`. Kept faithful (create-if-not-exists + drop/recreate
 * the table) and deliberately NOT cleaned up — sibling slots are live and the
 * schemas pre-date this run.
 */
export async function resetTestTableManySchemas() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const statements = letters
    .map(
      (letter) => `
        CREATE SCHEMA IF NOT EXISTS "Schema ${letter}";
        DROP TABLE IF EXISTS "Schema ${letter}"."Animals";
        CREATE TABLE "Schema ${letter}"."Animals" (name varchar(255), score integer);
        INSERT INTO "Schema ${letter}"."Animals" (name, score)
          VALUES ('Duck', 10), ('Horse', 20), ('Cow', 30);`,
    )
    .join("\n");
  await queryWritableDB(statements);
}

/**
 * Drop the transform's TARGET table in the shared writable container.
 *
 * 🔴 This has NO upstream counterpart and exists only because of the harness
 * gap in FINDINGS #85: Cypress's `H.restore("*-writable")` also calls
 * `resetWritableDb` (e2e/support/db_tasks.js:41), which drops the whole
 * warehouse; our `mb.restore("postgres-writable")` resets only the APP DB, and
 * `resetWritableDb` is not ported anywhere. So warehouse state accumulates
 * forever, and `POST /api/transform` pre-checks the target and 403s with
 * "A table with that name already exists."
 *
 * MEASURED, not assumed: before this was added, the transform test failed with
 * exactly that 403, and a direct `information_schema.tables` probe showed
 * `Schema A.transform_table` already present (with 38 non-system schemas in the
 * container — the debris had grown past the ~29 in the brief). The table was
 * NOT created by the failing run: the 403 is a pre-check, so the transform
 * never ran. It is prior debris from another spec/session.
 *
 * Deliberately scoped to the ONE table this spec targets rather than a
 * warehouse-wide reset: sibling slots are live, and the brief's rule is to name
 * fixtures distinctively and not drop foreign schemas. The `Schema A`…`Schema Z`
 * schemas are left in place.
 */
export async function dropTransformTargetTable(
  schema: string,
  table: string,
) {
  await queryWritableDB(
    `DROP TABLE IF EXISTS "${schema}"."${table}" CASCADE;`,
  );
}
