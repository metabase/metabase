/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/data-model/datamodel-data-studio-search.cy.spec.ts
 *
 * See findings-inbox/datamodel-data-studio-search.md for the full write-up
 * (collision checks, absence-assertion anchors, gate/token controls, mutation
 * results).
 */
import type { Locator } from "@playwright/test";

import { tablePicker } from "../support/admin-datamodel";
import {
  TablePicker,
  resetTestTableMultiSchema,
  visitDataModel,
} from "../support/data-model";
import {
  applyFilters,
  openFilterPopover,
} from "../support/datamodel-data-studio";
import {
  clearAndTypeSearch,
  getDatabaseCheckbox,
  getDatabaseToggle,
  getSchemaCheckbox,
  getSchemaToggle,
  noTablesFound,
  selectFilterOptionInForm,
  selectedTablesHeading,
  setBulkVisibilityLayer,
  typeSearch,
  waitForBulkTableUpdate,
} from "../support/datamodel-data-studio-search";
import { expect, test } from "../support/fixtures";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import {
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
  type SnowplowCapture,
} from "../support/search-snowplow";

const WRITABLE_DB_NAME = "Writable Postgres12";
const SAMPLE_DB_NAME = "Sample Database";
const DOMESTIC_SCHEMA = "Domestic";

/**
 * Port of `cy.get(<multi-element>).should("be.visible")`.
 *
 * Cypress asserts visibility of EVERY matched element and implicitly requires
 * at least one. A bare Playwright `toBeVisible()` on a locator matching more
 * than one node is a strict-mode violation instead, and `.first()` would weaken
 * the assertion. `TablePicker.getTable("Animals")` genuinely matches two rows
 * here (the fixture creates `Domestic.Animals` AND `Wild.Animals`), so this is
 * not hypothetical.
 *
 * The "at least one" step must RETRY. `locator.count()` is a one-shot snapshot,
 * whereas the Cypress original retries the whole assertion until the tree has
 * rendered. Every other call site here happens to be preceded by a
 * `toHaveCount(n)` that incidentally supplied that wait; "should allow to
 * hide/show table and schemas" is not, so it read the count while the search
 * results were still rendering and failed with `Expected: > 0, Received: 0`.
 * `expect.poll` restores the retry — it does not weaken the assertion.
 */
async function expectAllVisible(locator: Locator) {
  await expect.poll(() => locator.count()).toBeGreaterThan(0);
  const count = await locator.count();
  for (let index = 0; index < count; index++) {
    await expect(locator.nth(index)).toBeVisible();
  }
}

test.describe("Search", () => {
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable QA Postgres database (writable_db on :5404) and the postgres-writable snapshot (set PW_QA_DB_ENABLED)",
  );

  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    // Upstream orders this `signInAsAdmin()` BEFORE `restore()`; restoring
    // replaces the app DB (and therefore the session), so the sign-in is
    // re-issued after the restore here. Same terminal state, one fewer
    // dead call.
    await mb.restore("postgres-writable");
    // H.resetSnowplow() — the browser-boundary capture must be installed
    // before the first navigation (the tracker is built during app bootstrap).
    capture = await installSnowplowCapture(page, mb.baseUrl);
    capture.reset();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await resetTestTableMultiSchema();
    await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });
  });

  test("should support prefix-based search", async ({ page }) => {
    await visitDataModel(page, "data studio");

    await typeSearch(page, "an");
    await expect(TablePicker.getTables(page)).toHaveCount(3);
    await expectAllVisible(TablePicker.getTable(page, "Analytic Events"));
    await expectAllVisible(TablePicker.getTable(page, "Animals"));
    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_table_picker_search_performed",
    });
  });

  test("should support wildcard search with *", async ({ page }) => {
    await visitDataModel(page, "data studio");

    // ANCHOR: `typeSearch` awaits GET /api/table?term=irds before we assert the
    // empty state. "No tables found" is otherwise reachable pre-fetch whenever
    // the RTK-Query cache already holds an entry for the term, and it is the
    // exact shape a raced read produces.
    await typeSearch(page, "irds");
    await expect(noTablesFound(page)).toBeVisible();
    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_table_picker_search_performed",
    });

    await clearAndTypeSearch(page, "*irds");
    await expect(TablePicker.getTables(page)).toHaveCount(1);
    await expectAllVisible(TablePicker.getTable(page, "Birds"));
    await expectUnstructuredSnowplowEvent(
      capture,
      { event: "data_studio_table_picker_search_performed" },
      2,
    );
  });

  test("should allow using shift key to select multiple tables", async ({
    page,
  }) => {
    await visitDataModel(page, "data studio");
    await typeSearch(page, "a");

    await expect(TablePicker.getTables(page)).toHaveCount(4);
    await TablePicker.getTable(page, "Accounts")
      .locator('input[type="checkbox"]')
      .click();
    await TablePicker.getTable(page, "Animals")
      .nth(0)
      .locator('input[type="checkbox"]')
      .click({ modifiers: ["Shift"] });

    await expect(selectedTablesHeading(page, 3)).toBeVisible();
  });

  test("should remove the active highlight once tables are selected", async ({
    page,
  }) => {
    await visitDataModel(page, "data studio");

    await typeSearch(page, "an");
    const firstAnimals = TablePicker.getTable(page, "Animals").nth(0);
    const secondAnimals = TablePicker.getTable(page, "Animals").nth(1);

    await expect(firstAnimals).toBeVisible();
    await firstAnimals.click();
    await expect(firstAnimals).toHaveAttribute("aria-selected", "true");

    await firstAnimals.locator('input[type="checkbox"]').check();
    await expect(secondAnimals).toBeVisible();
    await secondAnimals.click();

    // ANCHOR for both absence assertions: the rows themselves are asserted
    // visible above and are still matched here, so `not.have.attr` is a
    // statement about a RENDERED row rather than about a missing one.
    await expect(firstAnimals).toBeVisible();
    await expect(secondAnimals).toBeVisible();
    await expect(firstAnimals).not.toHaveAttribute("aria-selected", "true");
    await expect(secondAnimals).not.toHaveAttribute("aria-selected", "true");
  });

  test("should select/deselect tables with clicking checkboxes", async ({
    page,
  }) => {
    await visitDataModel(page, "data studio");
    await typeSearch(page, "a");
    await expect(TablePicker.getTables(page)).toHaveCount(4);
    const accountsCheckbox = TablePicker.getTable(page, "Accounts").locator(
      'input[type="checkbox"]',
    );
    const analyticEventsCheckbox = TablePicker.getTable(
      page,
      "Analytic Events",
    ).locator('input[type="checkbox"]');
    await accountsCheckbox.check();
    await analyticEventsCheckbox.check();
    await expect(selectedTablesHeading(page, 2)).toBeVisible();
    await accountsCheckbox.uncheck();
    // ANCHOR: the checkbox we just unchecked is rendered and unchecked, and
    // the sibling we did NOT touch is still checked — so the heading's absence
    // is being read off a settled selection state, not off an unmounted tree.
    await expect(accountsCheckbox).not.toBeChecked();
    await expect(analyticEventsCheckbox).toBeChecked();
    await expect(selectedTablesHeading(page, 2)).toHaveCount(0);

    // clear selection when changing search query
    await accountsCheckbox.check();
    await expect(selectedTablesHeading(page, 2)).toBeVisible();
    // ANCHOR: "a" -> "ac" issues a fresh search; await its response (and the
    // resulting rows) before asserting the heading is gone, or the absence
    // could be satisfied by the pre-fetch render.
    await typeSearch(page, "c", "ac");
    await expect(tablePicker(page)).toBeVisible();
    await expect(selectedTablesHeading(page, 2)).toHaveCount(0);
  });

  test("should select/deselect databases and schemas", async ({ page }) => {
    await visitDataModel(page, "data studio");
    await typeSearch(page, "a");
    // wait for the tables to be loaded
    await expect(TablePicker.getTables(page)).toHaveCount(4);

    await getDatabaseCheckbox(page, SAMPLE_DB_NAME).click();
    await expect(selectedTablesHeading(page, 2)).toBeVisible();
    await getDatabaseCheckbox(page, WRITABLE_DB_NAME).click();
    await expect(selectedTablesHeading(page, 4)).toBeVisible();
    await getSchemaCheckbox(page, DOMESTIC_SCHEMA).click();
    await expect(selectedTablesHeading(page, 3)).toBeVisible();
    await getDatabaseCheckbox(page, WRITABLE_DB_NAME).click();
    await expect(selectedTablesHeading(page, 4)).toBeVisible();
  });

  test("should allow to hide/show table and schemas", async ({ page }) => {
    await visitDataModel(page, "data studio");
    await typeSearch(page, "a");
    const sampleDbTables = ["Accounts", "Analytic Events"];

    for (const table of sampleDbTables) {
      await expectAllVisible(TablePicker.getTable(page, table));
    }

    await getDatabaseToggle(page, SAMPLE_DB_NAME).click();
    // ANCHOR: the Sample Database row is still rendered and its disclosure now
    // reads collapsed. Without this the `toHaveCount(0)` below is satisfied on
    // its first poll by any state in which the tree has not rendered at all.
    await expect(getDatabaseToggle(page, SAMPLE_DB_NAME)).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    for (const table of sampleDbTables) {
      await expect(TablePicker.getTable(page, table)).toHaveCount(0);
    }

    await expect(TablePicker.getTable(page, "Animals")).toHaveCount(2);
    await getSchemaToggle(page, DOMESTIC_SCHEMA).click();
    await expect(TablePicker.getTable(page, "Animals")).toHaveCount(1);

    await getDatabaseToggle(page, WRITABLE_DB_NAME).click();
    // ANCHOR: upstream's own next line. Both database rows are still rendered
    // (only their children collapsed), which is what makes "0 tables" mean
    // "collapsed" rather than "tree gone".
    await expect(TablePicker.getDatabases(page)).toHaveCount(2);
    await expect(TablePicker.getTables(page)).toHaveCount(0);
  });

  test("should deselect and hide tables that are not in the search results", async ({
    page,
  }) => {
    await visitDataModel(page, "data studio");

    // ANCHOR: with an empty query `TablePicker.tsx` renders the plain `Tree`
    // (collapsed databases), not `SearchNew` — so "0 tables" here is a
    // statement about a RENDERED collapsed tree. Assert the databases are
    // present first; otherwise this passes before the picker mounts at all.
    await expect(TablePicker.getDatabases(page)).toHaveCount(2);
    await expect(TablePicker.getTables(page)).toHaveCount(0);
    await typeSearch(page, "a");
    await expect(TablePicker.getTables(page)).toHaveCount(4);

    for (const database of [WRITABLE_DB_NAME, SAMPLE_DB_NAME]) {
      await getDatabaseCheckbox(page, database).click();
    }
    await expect(selectedTablesHeading(page, 4)).toBeVisible();
    await expect(
      TablePicker.getTables(page).locator('input[type="checkbox"]:checked'),
    ).toHaveCount(4);

    await openFilterPopover(page);
    // Upstream wraps these two in
    // `cy.findByTestId("table-picker-filter").within(...)`; the scoped variant
    // reproduces that (see support/datamodel-data-studio-search.ts).
    await selectFilterOptionInForm(page, "Visibility layer", "Internal");
    await applyFilters(page);

    // ANCHOR: rows are still rendered after the filter round-trip (the filter
    // narrows the result set, it does not empty it), so "0 checked" is about
    // a populated grid whose boxes were cleared — not about an empty grid.
    await expect(TablePicker.getTables(page)).not.toHaveCount(0);
    await expect(
      TablePicker.getTables(page).locator('input[type="checkbox"]:checked'),
    ).toHaveCount(0);

    await getDatabaseCheckbox(page, WRITABLE_DB_NAME).click();

    await expect(selectedTablesHeading(page, 2)).toBeVisible();

    // NOT a filter change — see setBulkVisibilityLayer. This is the picker's
    // bulk-attribute editor, and it WRITES the two selected tables to "Final",
    // which drops them out of the active "Internal" filter.
    const bulkUpdate = waitForBulkTableUpdate(page);
    await setBulkVisibilityLayer(page, "Final");
    await bulkUpdate;
    await expect(noTablesFound(page)).toBeVisible();
    // ANCHOR: the empty state above is the positive anchor — the picker has
    // rendered its post-filter result (zero rows) before we assert the
    // selection heading is gone.
    await expect(selectedTablesHeading(page, 2)).toHaveCount(0);
  });
});
