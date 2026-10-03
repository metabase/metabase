/**
 * Helpers for the admin-reproductions spec port
 * (e2e/test/scenarios/admin/admin-reproductions.cy.spec.js).
 *
 * Own module per PORTING.md rule 9 — the shared support files stay untouched.
 * Everything here is either (a) a Cypress helper with no existing Playwright
 * port, or (b) an upstream-faithful variant of one that exists but differs in
 * a way that matters for this spec.
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { popover } from "./ui";

/** Mirrors e2e/support/cypress_data.js */
export const SAMPLE_DB_ID = 1;
export const WRITABLE_DB_ID = 2;

/**
 * Port of H.segmentEditorPopover (e2e-ui-elements-helpers.js:605):
 * `popover({ testId: "segment-popover" })`. Note the Cypress `popover()`
 * helper filters to *visible* popovers, so this does too.
 */
export function segmentEditorPopover(page: Page): Locator {
  return popover(page).and(page.getByTestId("segment-popover"));
}

/**
 * Port of H.relativeDatePicker.setStartingFrom (e2e-relative-date-picker-helpers.js).
 *
 * Deliberately NOT the shared `addPickerStartingFrom` (relative-datetime.ts):
 * that one is the port of `addStartingFrom`, which first clicks the
 * "Starting from…" toggle. This spec's test already clicked that toggle by
 * hand in the popover block above, so re-clicking it would collapse the
 * controls again.
 *
 * Units carry different labels depending on value/direction ("days" for the
 * interval, "days ago" for the offset) — upstream matches on the prefix with
 * `new RegExp("^" + unit, "i")`, so this does the same.
 */
export async function setPickerStartingFrom(
  page: Page,
  { value, unit }: { value: number; unit: string },
  container: Locator,
) {
  await container
    .getByLabel("Starting from interval", { exact: true })
    .fill(String(value));
  await container
    .getByRole("textbox", { name: "Starting from unit", exact: true })
    .click();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: new RegExp(`^${unit}`, "i") })
    .click();
}

/**
 * Environment compensation — NOT part of the upstream spec.
 *
 * Cypress's `H.restore("*-writable")` also runs `resetWritableDb`
 * (e2e/support/db_tasks.js:41), which for postgres DROPs every non-`public`
 * schema and every table in `public`. This harness's `mb.restore()` does the
 * app-DB half only, so the writable warehouse accumulates forever: it
 * currently holds 29 schemas (`Domestic`, `Schema A`–`Schema Z`, `Wild`,
 * `public`) left behind by sibling specs. A full `sync_schema` then discovers
 * all of them (37 tables), which makes the data mini-picker insert a SCHEMA
 * level it does not have upstream — and `public` sorts past the ~18 rows the
 * virtualized list keeps in the DOM, so it is unreachable.
 *
 * Dropping the foreign schemas is not an option (sibling slots live in them,
 * and the shared `resetWritableDb` fix is owed elsewhere). Instead, scope the
 * *database's* sync to `public` via the postgres driver's `schema-filters`
 * connection property (src/metabase/driver/postgres.clj:181). That reproduces
 * exactly the metadata shape upstream gets from a freshly-reset warehouse,
 * without mutating the warehouse. The app DB is restored by the next test's
 * `mb.restore()`, so the change does not persist.
 */
export async function scopeWritableDbToPublicSchema(
  api: MetabaseApi,
  dbId: number = WRITABLE_DB_ID,
) {
  const database = (await (await api.get(`/api/database/${dbId}`)).json()) as {
    details: Record<string, unknown>;
  };
  await api.put(`/api/database/${dbId}`, {
    details: {
      ...database.details,
      "schema-filters-type": "inclusion",
      "schema-filters-patterns": "public",
    },
  });
}

/**
 * Port of H.waitForSyncToFinish (e2e-qa-databases-helpers.js:357) in its
 * `tableName` form, as issue 41765 calls it: poll
 * `GET /api/database/:id/metadata` every 500ms until a table with this name
 * reports `initial_sync_status === "complete"`, giving up after 40 iterations.
 *
 * ⚠️ Recorded faithfully, weakness and all. `initial_sync_status` is a
 * *first-ever-sync* flag: once a table is "complete" it stays "complete"
 * across subsequent `sync_schema` runs. 41765's beforeEach already resyncs the
 * database and waits for exactly this table, so by the time the test body
 * calls this after clicking "Sync database schema", the predicate is already
 * true and the helper returns after a single 500ms sleep. It does NOT wait for
 * the newly-added column to appear. Upstream is therefore racing the sync; the
 * port reproduces that race rather than papering over it. See the findings
 * file.
 */
export async function waitForSyncToFinish(
  api: MetabaseApi,
  { dbId = WRITABLE_DB_ID, tableName }: { dbId?: number; tableName: string },
) {
  const SYNC_RETRY_DELAY_MS = 500;
  const MAX_RESYNC_ITERATIONS = 40;

  for (let iteration = 0; iteration < MAX_RESYNC_ITERATIONS; iteration++) {
    await new Promise((resolve) => setTimeout(resolve, SYNC_RETRY_DELAY_MS));
    const response = await api.get(`/api/database/${dbId}/metadata`);
    const body = (await response.json()) as {
      tables: { name: string; initial_sync_status: string }[];
    };
    if (
      body.tables.length &&
      body.tables.some(
        (table) =>
          table.name === tableName && table.initial_sync_status === "complete",
      )
    ) {
      return;
    }
  }
  throw new Error("The sync is taking too long. Something is wrong.");
}
