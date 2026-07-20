/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/data-model/datamodel-data-studio.cy.spec.ts
 *
 * The data-studio data-model surface: table picker (search / filtering /
 * select-deselect / extra info), table section (name, description, sorting,
 * sync options), field section (metadata, display values), and the preview
 * section.
 *
 * Port notes
 * ----------
 * - **QA-DATABASE TIER.** Eight tests restore the `postgres-writable` snapshot
 *   and drive the writable QA Postgres container; they are gated on
 *   `PW_QA_DB_ENABLED` (the deliberate gate — bare `QA_DB_ENABLED` leaks
 *   truthy from cypress.env.json). Upstream tags only three of them
 *   `@external`; the "Extra info about tables" describe and "should filter
 *   unused tables only" restore `postgres-writable` with **no** tag, so a
 *   `-@external` CI leg runs them against a container it does not have. Same
 *   shape as the untagged mysql-8 test flagged by data-model-shared-1 — see
 *   findings-inbox/datamodel-data-studio.md.
 * - **Snowplow is a real subject here**, so rule 6's no-op stub is wrong: two
 *   tests assert `data_studio_table_picker_*` / `dependency_entity_selected`,
 *   all of which are `trackSimpleEvent` call sites in `frontend/` and hence
 *   capturable at the browser boundary (`support/search-snowplow.ts`
 *   `installSnowplowCapture`). `H.expectNoBadSnowplowEvents` degrades to the
 *   documented structural check (no Iglu validation without micro).
 * - `cy.intercept().as()` + `cy.wait()` → `page.waitForResponse` registered
 *   before the triggering action (rule 2). The beforeEach registered eleven
 *   aliases; the never-awaited ones (`schemas`, `schema`, `metadata`,
 *   `fieldValues`, `updateTables`, `updateFieldSpy`) are dropped.
 * - Metadata inputs are EditableText-style: `fill()` does not mark them dirty,
 *   so `.clear().type(x).blur()` ports as `replaceValue` + `blur`, with the
 *   PUT wait registered before the edit (not before the blur — the commit
 *   point is not guaranteed to be the blur).
 * - `cy.findByTestId("loading-indicator", { timeout: 0 })` is a genuinely
 *   MOMENTARY absence check; it is the one place a non-retrying `count()` is
 *   the faithful port (PORTING's own carve-out).
 * - `H.moveDnDKitElementByAlias` → the real-mouse `moveDnDKitElement`.
 * - `cy.realPress("Escape")` → `keyboard.press("Escape")` preceded by
 *   `parkMouseAwayFromTooltips` (a parked real cursor opens a tooltip that
 *   swallows the first Escape — wave-9 gotcha; Cypress's synthetic clicks
 *   never moved the OS cursor).
 * - Sample-data-derived values (the `Total` preview rows) are pinned by
 *   upstream and kept verbatim; they are a known drift risk across jars
 *   (FINDINGS #43).
 */
import type { Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import {
  openOrdersTable,
  openProductsTable,
  openReviewsTable,
  openTable,
} from "../support/ad-hoc-question";
import { resolveToken } from "../support/api";
import { commandPalette, openCommandPalette } from "../support/command-palette";
import { moveDnDKitElement } from "../support/dashboard-cards";
import {
  FieldSection,
  PreviewSection,
  SAMPLE_DB_SCHEMA_ID,
  TablePicker,
  TableSection,
  hoverPreviewHeaderCell,
  hovercard,
  replaceValue,
  resetTestTableMultiSchema,
  verifyTablePreview,
  visitDataModel,
  waitForFieldUpdate,
  waitForTableUpdate,
} from "../support/data-model";
import {
  applyFilters,
  clickDetailsTab,
  clickPopoverOption,
  expectTableNotVisible,
  expectTableVisible,
  getActionsMenuButton,
  getDatabaseCheckbox,
  getDependencyGraphLink,
  getDisplayValuesFkTargetInput,
  getDisplayValuesInput,
  getFieldSectionCloseButton,
  getFieldValuesButton,
  getFilterForm,
  getFilteringInput,
  getSchemaCheckbox,
  getSortOrderOption,
  getSortOrderRadio,
  getSortableField,
  getSortableFields,
  getTableCheckbox,
  getTableId,
  getTableSectionCloseButton,
  getVisibilityTypeInput,
  openFilterPopover,
  openWritableDomesticSchema,
  selectFilterOption,
  selectOwnerByEmail,
  selectOwnerByName,
  setUserAsAnalyst,
  stubEstimatedRowCount,
  toggleUnusedFilter,
  updateTableAttributes,
  verifyAndCloseToastFirst,
  blurFocused,
  closeToast,
} from "../support/datamodel-data-studio";
import { parkMouseAwayFromTooltips } from "../support/documents";
import { findByDisplayValue } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { assertTableData } from "../support/multiple-column-breakouts";
import {
  miniPicker,
  startNewQuestion,
  tableHeaderColumn,
} from "../support/notebook";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  WRITABLE_DB_ID,
  menu,
  queryWritableDB,
  resyncDatabase,
} from "../support/schema-viewer";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { icon, main, modal, popover } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS_ID, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

/** Port of NODATA_USER_ID (cypress_sample_instance_data.js). */
const NODATA_USER_ID = (() => {
  const user = SAMPLE_INSTANCE_DATA.users.find(
    ({ email }) => email === "nodata@metabase.test",
  );
  if (!user) {
    throw new Error("nodata user not found in cypress_sample_instance_data");
  }
  return user.id;
})();

const QA_DB_SKIP_REASON =
  "Requires the writable QA Postgres container and its postgres-writable snapshot (set PW_QA_DB_ENABLED)";

const visit = (page: Page, options?: Parameters<typeof visitDataModel>[2]) =>
  visitDataModel(page, "data studio", options);

/** POST /api/dataset — the spec's `@dataset` alias. */
function waitForDataset(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** POST /api/field/:id/values — the spec's `@updateFieldValues` alias. */
function waitForUpdateFieldValues(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/field\/\d+\/values$/.test(new URL(response.url()).pathname),
  );
}

/** POST /api/field/:id/dimension — the spec's `@updateFieldDimension` alias. */
function waitForUpdateFieldDimension(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/field\/\d+\/dimension$/.test(new URL(response.url()).pathname),
  );
}

/** PUT /api/table/:id/fields/order — the spec's `@updateFieldOrder` alias. */
function waitForUpdateFieldOrder(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/table\/\d+\/fields\/order$/.test(
        new URL(response.url()).pathname,
      ),
  );
}

/**
 * Port of the spec's "should not show loading state after an update
 * (metabase#56482)" check. `{ timeout: 0 }` makes this an explicitly
 * MOMENTARY, one-shot absence assertion — the carve-out where a non-retrying
 * `count()` is the faithful port rather than `toHaveCount(0)`.
 */
async function expectNoLoadingIndicator(page: Page) {
  expect(await page.getByTestId("loading-indicator").count()).toBe(0);
}

test.describe("scenarios > data studio > datamodel", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    // H.resetSnowplow(): the capture below starts empty per test, so the
    // reset is implicit.
    capture = await installSnowplowCapture(page, mb.baseUrl);
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test.describe("Table picker", () => {
    test.describe("1 database, 1 schema", () => {
      test("should allow to search for tables", async ({ page }) => {
        await visit(page);

        const searchInput = TablePicker.getSearchInput(page);
        await searchInput.click();
        await searchInput.pressSequentially("or");

        await expect(TablePicker.getTables(page)).toHaveCount(1);
        await expect(TablePicker.getTable(page, "Orders")).toBeVisible();
        await TablePicker.getTable(page, "Orders").click();

        await expect
          .poll(() => new URL(page.url()).pathname)
          .toBe(
            `/data-studio/data/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
          );
        await expect(TableSection.getNameInput(page)).toHaveValue("Orders");

        // no results
        await searchInput.clear();
        await searchInput.pressSequentially("xyz");
        await expect(
          page
            .getByTestId("table-picker")
            .getByText("No tables found", { exact: true }),
        ).toBeVisible();

        // go back to browsing
        await searchInput.clear();
        await expect(TablePicker.getTables(page)).toHaveCount(8);
      });
    });

    test.describe("mutliple databases, with single and multiple schemas", () => {
      test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

      test.beforeEach(async ({ mb }) => {
        await mb.restore("postgres-writable");
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");

        await resetTestTableMultiSchema();
        await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });
      });

      test(
        "should allow to search for tables",
        { tag: "@external" },
        async ({ page }) => {
          await visit(page);

          const searchInput = TablePicker.getSearchInput(page);
          await searchInput.click();
          await searchInput.pressSequentially("an");

          await expect(TablePicker.getTables(page)).toHaveCount(3);
          await expect(TablePicker.getTable(page, "Animals")).toHaveCount(2);
          await expect(
            TablePicker.getTable(page, "Analytic Events"),
          ).toBeVisible();

          await searchInput.clear();
          await searchInput.pressSequentially("ani");
          await expect(TablePicker.getTables(page)).toHaveCount(2);

          const secondAnimals = TablePicker.getTable(page, "Animals").nth(1);
          await expect(secondAnimals).toBeVisible();
          await secondAnimals.click();

          await expect
            .poll(() => new URL(page.url()).pathname)
            .toMatch(
              new RegExp(
                `^/data-studio/data/database/${WRITABLE_DB_ID}/schema/${WRITABLE_DB_ID}:Wild/table/`,
              ),
            );
          await expect(TableSection.getNameInput(page)).toHaveValue("Animals");

          // go back to browsing
          await searchInput.clear();
          await expect(TablePicker.getTables(page)).toHaveCount(2);
        },
      );

      test(
        "should restore previously selected table when expanding the tree",
        { tag: "@external" },
        async ({ page }) => {
          await visit(page);

          await TablePicker.getDatabase(page, "Writable Postgres12").click();
          await TablePicker.getSchema(page, "Domestic").click();
          await TablePicker.getTable(page, "Animals").click();
          await TablePicker.getSchema(page, "Wild").click();
          await TablePicker.getTable(page, "Birds").click();
          await expect(TablePicker.getTable(page, "Birds")).toHaveAttribute(
            "aria-selected",
            "true",
          );

          await TablePicker.getTable(page, "Birds")
            .locator('input[type="checkbox"]')
            .check();
          await expect(
            TablePicker.getTable(page, "Birds"),
          ).not.toHaveAttribute("aria-selected", "true");

          await TablePicker.getDatabase(page, "Writable Postgres12").click();
          await TablePicker.getDatabase(page, "Writable Postgres12").click();

          await expect(TableSection.getNameInput(page)).toHaveValue("Birds");
        },
      );
    });

    test.describe("Extra info about tables", () => {
      // Upstream carries NO @external tag on this describe even though its
      // beforeEach restores postgres-writable — flagged in findings.
      test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

      const databaseName = "Writable Postgres12";
      const domesticSchema = "Domestic";
      const wildSchema = "Wild";
      const domesticAnimalsTable = "Animals";
      const wildBirdsTable = "Birds";

      test.beforeEach(async ({ mb }) => {
        await mb.restore("postgres-writable");
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");
        await resetTestTableMultiSchema();
        await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });
      });

      test("should show the table owner", async ({ page, mb }) => {
        const { id, common_name } = (await (
          await mb.api.get("/api/user/current")
        ).json()) as { id: number; common_name: string };

        await updateTableAttributes(mb.api, {
          databaseId: WRITABLE_DB_ID,
          displayName: domesticAnimalsTable,
          attributes: { owner_user_id: id },
        });

        await openWritableDomesticSchema(
          page,
          () => visit(page),
          databaseName,
          domesticSchema,
        );

        await expect(
          TablePicker.getTable(page, domesticAnimalsTable).getByTestId(
            "table-owner",
          ),
        ).toContainText(common_name);
      });

      test("should display the estimated row count", async ({ page }) => {
        const EXPECTED_ROWS = 3210;

        await stubEstimatedRowCount(page, {
          databaseId: WRITABLE_DB_ID,
          schemaName: domesticSchema,
          tableName: domesticAnimalsTable,
          rowCount: EXPECTED_ROWS,
        });

        await openWritableDomesticSchema(
          page,
          () => visit(page),
          databaseName,
          domesticSchema,
        );

        await expect(
          TablePicker.getTable(page, domesticAnimalsTable).getByTestId(
            "table-expected-rows",
          ),
        ).toContainText("3,210");
      });

      test("should indicate published tables", async ({ page, mb }) => {
        const tableId = await getTableId(mb.api, {
          databaseId: WRITABLE_DB_ID,
          name: domesticAnimalsTable,
        });
        await mb.api.createLibrary();
        await mb.api.publishTables({ table_ids: [tableId] });

        await openWritableDomesticSchema(
          page,
          () => visit(page),
          databaseName,
          domesticSchema,
        );

        await expect(
          TablePicker.getTable(page, domesticAnimalsTable)
            .getByTestId("table-published")
            .getByLabel("Published", { exact: true }),
        ).toBeVisible();

        await TablePicker.getSchema(page, wildSchema).click();

        // Anchored on the row being present so the absence check can't pass
        // on an unrendered tree.
        await expect(
          TablePicker.getTable(page, wildBirdsTable),
        ).toBeVisible();
        await expect(
          icon(TablePicker.getTable(page, wildBirdsTable), "verified_round"),
        ).toHaveCount(0);
      });
    });

    test.describe("Filtering", () => {
      test("should filter tables by visibility layer", async ({ page, mb }) => {
        const finalTableId = await updateTableAttributes(mb.api, {
          databaseId: SAMPLE_DB_ID,
          displayName: "Orders",
          attributes: { data_layer: "final" },
        });

        const hiddenTableId = await updateTableAttributes(mb.api, {
          databaseId: SAMPLE_DB_ID,
          displayName: "Products",
          attributes: { data_layer: "hidden" },
        });

        await visit(page);

        await openFilterPopover(page);

        // Filter popover should close on click outside
        await TablePicker.getSearchInput(page).click();
        await expect(getFilterForm(page)).toHaveCount(0);

        await openFilterPopover(page);
        await selectFilterOption(page, "Visibility layer", "Final");
        await applyFilters(page);

        await expectUnstructuredSnowplowEvent(capture, {
          event: "data_studio_table_picker_filters_applied",
        });
        await expectUnstructuredSnowplowEvent(capture, {
          event: "data_studio_table_picker_search_performed",
        });

        await expectTableVisible(page, finalTableId);
        await expectTableNotVisible(page, hiddenTableId);
      });

      test("should filter tables owned by unspecified", async ({
        page,
        mb,
      }) => {
        const { id } = (await (
          await mb.api.get("/api/user/current")
        ).json()) as { id: number };

        const ownedTableId = await updateTableAttributes(mb.api, {
          databaseId: SAMPLE_DB_ID,
          displayName: "Orders",
          attributes: { owner_user_id: id },
        });

        const unownedTableId = await getTableId(mb.api, {
          databaseId: SAMPLE_DB_ID,
          displayName: "Products",
        });

        await visit(page);

        await openFilterPopover(page);
        await selectFilterOption(page, "Owner", "Unspecified");
        await applyFilters(page);

        await expectTableVisible(page, unownedTableId);
        await expectTableNotVisible(page, ownedTableId);
      });

      test("should filter tables by owner user", async ({ page, mb }) => {
        const { id, common_name } = (await (
          await mb.api.get("/api/user/current")
        ).json()) as { id: number; common_name: string };

        const ownedTableId = await updateTableAttributes(mb.api, {
          databaseId: SAMPLE_DB_ID,
          displayName: "Orders",
          attributes: { owner_user_id: id },
        });

        const unownedTableId = await getTableId(mb.api, {
          databaseId: SAMPLE_DB_ID,
          displayName: "Products",
        });

        await visit(page);

        await openFilterPopover(page);
        await selectOwnerByName(page, common_name);
        await applyFilters(page);

        await expectTableVisible(page, ownedTableId);
        await expectTableNotVisible(page, unownedTableId);
      });

      test("should filter tables by owner email", async ({ page, mb }) => {
        const OWNER_EMAIL = "owner-filter@example.com";

        const emailOwnedTableId = await updateTableAttributes(mb.api, {
          databaseId: SAMPLE_DB_ID,
          displayName: "Orders",
          attributes: { owner_email: OWNER_EMAIL, owner_user_id: null },
        });

        const otherTableId = await getTableId(mb.api, {
          databaseId: SAMPLE_DB_ID,
          displayName: "Products",
        });

        await visit(page);

        await openFilterPopover(page);
        await selectOwnerByEmail(page, OWNER_EMAIL);
        await applyFilters(page);

        await expectTableVisible(page, emailOwnedTableId);
        await expectTableNotVisible(page, otherTableId);
      });

      test("should filter tables by source", async ({ page, mb }) => {
        const uploadedTableId = await updateTableAttributes(mb.api, {
          databaseId: SAMPLE_DB_ID,
          displayName: "Orders",
          attributes: { data_source: "upload" },
        });

        const ingestedTableId = await updateTableAttributes(mb.api, {
          databaseId: SAMPLE_DB_ID,
          displayName: "Products",
          attributes: { data_source: "ingested" },
        });

        await visit(page);

        await openFilterPopover(page);
        await selectFilterOption(page, "Source", "Uploaded data");
        await applyFilters(page);

        await expectTableVisible(page, uploadedTableId);
        await expectTableNotVisible(page, ingestedTableId);
      });

      test("should filter unused tables only", async ({ page, mb }) => {
        // Upstream carries no @external tag despite restoring
        // postgres-writable — flagged in findings.
        test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

        await mb.restore("postgres-writable");
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");
        await resetTestTableMultiSchema();
        await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });

        const usedTableName = "Animals";
        const unusedTableName = "Birds";

        const usedTableId = await getTableId(mb.api, {
          databaseId: WRITABLE_DB_ID,
          displayName: usedTableName,
        });
        await mb.api.createQuestion({
          database: WRITABLE_DB_ID,
          name: "filter used question",
          query: { "source-table": usedTableId },
        });

        const unusedTableId = await getTableId(mb.api, {
          databaseId: WRITABLE_DB_ID,
          name: unusedTableName,
        });

        // The "table is referenced by something" state is registered
        // asynchronously after POST /api/card; the picker refetches once and
        // caches, so a stale read cannot be rescued by assertion retry.
        // Gate on the backend's OWN filtered endpoint before driving the UI
        // (PORTING: poll the backend until it reflects the mutation).
        await expect
          .poll(async () => {
            const response = await mb.api.get("/api/table?term=&unused-only=true");
            const tables = (await response.json()) as { id: number }[];
            return tables.some((table) => table.id === usedTableId);
          })
          .toBe(false);

        await visit(page);

        await openFilterPopover(page);
        await toggleUnusedFilter(page, true);
        await applyFilters(page);

        await expectTableVisible(page, unusedTableId);
        await expectTableNotVisible(page, usedTableId);
      });
    });

    test(
      "select/deselect functionality",
      { tag: "@external" },
      async ({ page, mb }) => {
        test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

        await mb.restore("postgres-writable");
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");
        await resetTestTableMultiSchema();
        await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });

        await visit(page);

        const databaseName = "Writable Postgres12";
        const sampleDatabaseName = "Sample Database";
        const domesticSchema = "Domestic";
        const wildSchema = "Wild";
        const domesticTables = ["Animals"];
        const wildTables = ["Animals", "Birds"];
        const tablesInDatabase = [
          ...domesticTables.map((table) => ({
            schema: domesticSchema,
            table,
          })),
          ...wildTables.map((table) => ({ schema: wildSchema, table })),
        ];

        const databaseCheckbox = () => getDatabaseCheckbox(page, databaseName);
        const schemaCheckbox = (schemaName: string) =>
          getSchemaCheckbox(page, schemaName);
        const wpTableCheckbox = (schemaName: string, tableName: string) =>
          getTableCheckbox(page, WRITABLE_DB_ID, schemaName, tableName);
        const sampleTableCheckbox = (tableName: string) =>
          getTableCheckbox(page, SAMPLE_DB_ID, "PUBLIC", tableName);

        await TablePicker.getDatabase(page, databaseName).click();
        await TablePicker.getSchema(page, domesticSchema).click();
        await TablePicker.getSchema(page, wildSchema).click();
        await expect(TablePicker.getTables(page)).toHaveCount(3);

        // selecting a db selects all schemas and tables in it
        await databaseCheckbox().check();
        for (const schemaName of [domesticSchema, wildSchema]) {
          await expect(schemaCheckbox(schemaName)).toBeChecked();
        }
        for (const tableName of domesticTables) {
          await expect(
            wpTableCheckbox(domesticSchema, tableName),
          ).toBeChecked();
        }
        for (const tableName of wildTables) {
          await expect(wpTableCheckbox(wildSchema, tableName)).toBeChecked();
        }
        await databaseCheckbox().uncheck();
        for (const schemaName of [domesticSchema, wildSchema]) {
          await expect(schemaCheckbox(schemaName)).not.toBeChecked();
        }
        for (const { schema, table } of tablesInDatabase) {
          await expect(wpTableCheckbox(schema, table)).not.toBeChecked();
        }

        // selecting a schema selects all tables in it
        await schemaCheckbox(domesticSchema).check();
        for (const tableName of domesticTables) {
          await expect(
            wpTableCheckbox(domesticSchema, tableName),
          ).toBeChecked();
        }
        await schemaCheckbox(domesticSchema).uncheck();
        for (const tableName of domesticTables) {
          await expect(
            wpTableCheckbox(domesticSchema, tableName),
          ).not.toBeChecked();
        }

        // selecting all tables in a schema selects the schema
        await expect(schemaCheckbox(wildSchema)).not.toBeChecked();
        await wpTableCheckbox(wildSchema, "Animals").check();
        await expect(schemaCheckbox(wildSchema)).not.toBeChecked();
        await wpTableCheckbox(wildSchema, "Birds").check();
        await expect(schemaCheckbox(wildSchema)).toBeChecked();
        await schemaCheckbox(wildSchema).uncheck();
        for (const tableName of wildTables) {
          await expect(
            wpTableCheckbox(wildSchema, tableName),
          ).not.toBeChecked();
        }

        // selecting all schemas in a db selects the db
        await schemaCheckbox(domesticSchema).check();
        await schemaCheckbox(wildSchema).check();
        await expect(databaseCheckbox()).toBeChecked();
        await schemaCheckbox(domesticSchema).uncheck();
        await schemaCheckbox(wildSchema).uncheck();
        await expect(databaseCheckbox()).not.toBeChecked();

        // selecting all tables in a db selects the db
        for (const [index, { schema, table }] of tablesInDatabase.entries()) {
          await wpTableCheckbox(schema, table).check();
          if (index < tablesInDatabase.length - 1) {
            await expect(databaseCheckbox()).not.toBeChecked();
          }
        }
        await expect(databaseCheckbox()).toBeChecked();
        await databaseCheckbox().uncheck();
        for (const { schema, table } of tablesInDatabase) {
          await expect(wpTableCheckbox(schema, table)).not.toBeChecked();
        }

        // deselecting a table updates parent state
        await databaseCheckbox().check();
        await wpTableCheckbox(wildSchema, "Birds").uncheck();
        await expect(schemaCheckbox(wildSchema)).not.toBeChecked();
        // partially selected now, so clicking twice to make it unchecked
        await expect(databaseCheckbox()).not.toBeChecked();
        await databaseCheckbox().check();
        await databaseCheckbox().uncheck();
        for (const { schema, table } of tablesInDatabase) {
          await expect(wpTableCheckbox(schema, table)).not.toBeChecked();
        }

        // deselecting a schema clears its tables
        await schemaCheckbox(domesticSchema).check();
        await expect(
          page.getByPlaceholder("Give this table a name", { exact: true }),
        ).toHaveValue(domesticTables[0]);
        await expect(
          page.getByPlaceholder("Give this table a name", { exact: true }),
        ).toBeVisible();
        await schemaCheckbox(domesticSchema).uncheck();

        // schema toggle handles partially selected state
        await schemaCheckbox(wildSchema).check();
        await expect(
          page.getByRole("heading", { name: /2 tables selected/i }),
        ).toBeVisible();
        await wpTableCheckbox(wildSchema, "Birds").uncheck();
        await expect(
          page.getByPlaceholder("Give this table a name", { exact: true }),
        ).toHaveValue(domesticTables[0]);
        await expect(
          page.getByPlaceholder("Give this table a name", { exact: true }),
        ).toBeVisible();

        // first click selects all tables
        await schemaCheckbox(wildSchema).click();
        await expect(
          page.getByRole("heading", { name: /2 tables selected/i }),
        ).toBeVisible();
        // second click deselects all tables
        await schemaCheckbox(wildSchema).click();
        await expect(
          page.getByRole("heading", { name: /table[s]? selected/i }),
        ).toHaveCount(0);
        for (const tableName of wildTables) {
          await expect(
            wpTableCheckbox(wildSchema, tableName),
          ).not.toBeChecked();
        }

        // shift + click selects a range of tables
        await TablePicker.getDatabase(page, databaseName).click();
        await TablePicker.getDatabase(page, sampleDatabaseName).click();

        await expect(sampleTableCheckbox("Orders")).not.toBeChecked();
        await expect(sampleTableCheckbox("People")).not.toBeChecked();
        await expect(sampleTableCheckbox("Products")).not.toBeChecked();

        await sampleTableCheckbox("Orders").click();
        await sampleTableCheckbox("Products").click({
          modifiers: ["Shift"],
        });

        await expect(sampleTableCheckbox("Orders")).toBeChecked();
        await expect(sampleTableCheckbox("People")).toBeChecked();
        await expect(sampleTableCheckbox("Products")).toBeChecked();
        await expect(sampleTableCheckbox("Feedback")).not.toBeChecked();
      },
    );
  });

  test.describe("Table section", () => {
    test.describe("Name and description", () => {
      test("should allow analysts to edit all table metadata even without data access", async ({
        page,
        mb,
      }) => {
        await setUserAsAnalyst(mb.api, NODATA_USER_ID);

        await mb.signIn("nodata");
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        // change table name
        let tableUpdate = waitForTableUpdate(page);
        await replaceValue(TableSection.getNameInput(page), "Analyst Orders");
        await blurFocused(page);
        await tableUpdate;
        await verifyAndCloseToastFirst(page, "Table name updated");
        await expect(TableSection.getNameInput(page)).toHaveValue(
          "Analyst Orders",
        );

        // change table description
        tableUpdate = waitForTableUpdate(page);
        await replaceValue(
          TableSection.getDescriptionInput(page),
          "Description by analyst",
        );
        await blurFocused(page);
        await tableUpdate;
        await verifyAndCloseToastFirst(page, "Table description updated");
        await expect(TableSection.getDescriptionInput(page)).toHaveValue(
          "Description by analyst",
        );

        // change field name
        await TableSection.clickFieldsTab(page);
        let fieldUpdate = waitForFieldUpdate(page);
        await replaceValue(
          TableSection.getFieldNameInput(page, "Tax"),
          "Analyst Tax",
        );
        await blurFocused(page);
        await fieldUpdate;
        await verifyAndCloseToastFirst(page, "Name of Tax updated");
        await expect(
          TableSection.getFieldNameInput(page, "Analyst Tax"),
        ).toBeVisible();

        // change field description
        fieldUpdate = waitForFieldUpdate(page);
        await replaceValue(
          TableSection.getFieldDescriptionInput(page, "Total"),
          "Total edited by analyst",
        );
        await blurFocused(page);
        await fieldUpdate;
        await verifyAndCloseToastFirst(page, "Description of Total updated");

        // verify changes in data reference as admin
        await mb.signInAsAdmin();

        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        // snowplow event when dependency graph link is clicked
        await getDependencyGraphLink(page).click();
        await expectUnstructuredSnowplowEvent(capture, {
          event: "dependency_entity_selected",
          triggered_from: "data-structure",
          event_detail: "table",
        });

        await page.goto(
          `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`,
        );
        await expect(
          main(page).getByText("Analyst Orders", { exact: true }),
        ).toBeVisible();
        await expect(
          main(page).getByText("Description by analyst", { exact: true }),
        ).toBeVisible();

        // verify changes in question picker as normal user
        await mb.signInAsNormalUser();
        await startNewQuestion(page);
        await miniPicker(page)
          .getByText("Sample Database", { exact: true })
          .click();
        await expect(
          miniPicker(page).getByText("People", { exact: true }),
        ).toBeVisible();
        await expect(
          miniPicker(page).getByText("Analyst Orders", { exact: true }),
        ).toBeVisible();

        // verify field changes in table visualization
        await openOrdersTable(page);
        await expect(tableHeaderColumn(page, "Analyst Tax")).toBeVisible();
        await expect(tableHeaderColumn(page, "Tax")).toHaveCount(0);
      });
    });

    test.describe("Field name and description", () => {
      test("should allow clearing the field description", async ({ page }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        await TableSection.clickFieldsTab(page);
        const fieldUpdate = waitForFieldUpdate(page);
        await replaceValue(
          TableSection.getFieldDescriptionInput(page, "Total"),
          "",
        );
        await blurFocused(page);
        await fieldUpdate;
        await verifyAndCloseToastFirst(page, "Description of Total updated");
        await expect(
          TableSection.getFieldDescriptionInput(page, "Total"),
        ).toHaveValue("");

        // verify preview
        await TableSection.clickField(page, "Total");
        await FieldSection.getPreviewButton(page).click();
        await verifyTablePreview(page, {
          column: "Total",
          values: ["39.72", "117.03", "49.21", "115.23", "134.91"],
        });
        await hoverPreviewHeaderCell(page);
        await expect(hovercard(page)).not.toContainText(
          "The total billed amount.",
        );

        await page.goto(
          `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
        );
        await expect(page.getByText("Total", { exact: true })).toBeVisible();
        await expect(
          page.getByText("No description yet", { exact: true }),
        ).toBeVisible();
      });

      test("should allow analysts to edit field metadata but not preview data without data access", async ({
        page,
        mb,
      }) => {
        await setUserAsAnalyst(mb.api, NODATA_USER_ID);
        await mb.signIn("nodata");
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
        });

        await TableSection.clickFieldsTab(page);

        // change field name from table section
        let fieldUpdate = waitForFieldUpdate(page);
        await replaceValue(
          TableSection.getFieldNameInput(page, "Tax"),
          "Analyst Tax Field",
        );
        await blurFocused(page);
        await fieldUpdate;
        await verifyAndCloseToastFirst(page, "Name of Tax updated");
        await expect(
          TableSection.getFieldNameInput(page, "Analyst Tax Field"),
        ).toBeVisible();
        await expect(
          TableSection.getField(page, "Analyst Tax Field"),
        ).toBeVisible();

        // change field description from table section
        fieldUpdate = waitForFieldUpdate(page);
        await replaceValue(
          TableSection.getFieldDescriptionInput(page, "Total"),
          "Analyst total description",
        );
        await blurFocused(page);
        await fieldUpdate;
        await verifyAndCloseToastFirst(page, "Description of Total updated");
        await expect(
          TableSection.getFieldDescriptionInput(page, "Total"),
        ).toHaveValue("Analyst total description");

        // navigate to field detail and change semantic type
        await TableSection.clickField(page, "Discount");
        await expect(FieldSection.getSemanticTypeInput(page)).toHaveValue(
          "Discount",
        );
        fieldUpdate = waitForFieldUpdate(page);
        await FieldSection.getSemanticTypeInput(page).click();
        await clickPopoverOption(page, "Currency");
        await fieldUpdate;
        await verifyAndCloseToastFirst(page, "Semantic type of Discount updated");
        await expect(FieldSection.getSemanticTypeInput(page)).toHaveValue(
          "Currency",
        );

        // verify table preview is blocked without data permissions
        let dataset = waitForDataset(page);
        await FieldSection.getPreviewButton(page).click();
        await dataset;
        await expect(
          PreviewSection.get(page).getByText(
            "Sorry, you don’t have permission to see that.",
            { exact: true },
          ),
        ).toBeVisible();

        // verify detail preview is also blocked
        dataset = waitForDataset(page);
        await PreviewSection.getPreviewTypeInput(page)
          .getByText("Detail", { exact: true })
          .click();
        await dataset;
        await expect(
          PreviewSection.get(page).getByText(
            "Sorry, you don’t have permission to see that.",
            { exact: true },
          ),
        ).toBeVisible();

        // verify field changes in data reference as admin
        await mb.signInAsAdmin();
        await page.goto(
          `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
        );
        await expect(
          main(page).getByText("Total", { exact: true }),
        ).toBeVisible();
        await expect(
          main(page).getByText("Analyst total description", { exact: true }),
        ).toBeVisible();

        // verify field changes in table visualization as normal user
        await mb.signInAsNormalUser();
        await openOrdersTable(page);
        await expect(
          tableHeaderColumn(page, "Analyst Tax Field"),
        ).toBeVisible();
        await expect(tableHeaderColumn(page, "Tax")).toHaveCount(0);
        await expect(tableHeaderColumn(page, "Discount ($)")).toBeVisible();
      });
    });

    test.describe("Sorting", () => {
      test("should allow sorting fields as in the database", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        await TableSection.clickFieldsTab(page);
        await TableSection.getSortButton(page).click();
        await expect(getSortOrderRadio(page, "database")).toBeChecked();

        await openProductsTable(page);
        await assertTableData(page, {
          columns: [
            "ID",
            "Ean",
            "Title",
            "Category",
            "Vendor",
            "Price",
            "Rating",
            "Created At",
          ],
        });
      });

      test("should allow sorting fields alphabetically", async ({ page }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        await TableSection.clickFieldsTab(page);
        await TableSection.getSortButton(page).click();
        const tableUpdate = waitForTableUpdate(page);
        await getSortOrderOption(page, "Alphabetical order").click();
        await tableUpdate;
        await verifyAndCloseToastFirst(page, "Field order updated");
        await expect(getSortOrderRadio(page, "alphabetical")).toBeChecked();

        await openProductsTable(page);
        await assertTableData(page, {
          columns: [
            "Category",
            "Created At",
            "Ean",
            "ID",
            "Price",
            "Rating",
            "Title",
            "Vendor",
          ],
        });
      });

      test("should allow sorting fields smartly", async ({ page }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        await TableSection.clickFieldsTab(page);
        await TableSection.getSortButton(page).click();
        const tableUpdate = waitForTableUpdate(page);
        await getSortOrderOption(page, "Auto order").click();
        await tableUpdate;
        await verifyAndCloseToastFirst(page, "Field order updated");
        await expect(getSortOrderRadio(page, "smart")).toBeChecked();

        await openProductsTable(page);
        await assertTableData(page, {
          columns: [
            "ID",
            "Created At",
            "Category",
            "Ean",
            "Price",
            "Rating",
            "Title",
            "Vendor",
          ],
        });
      });

      test("should allow sorting fields in the custom order", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        await TableSection.clickFieldsTab(page);
        await TableSection.getSortButton(page).click();
        await expect(getSortOrderRadio(page, "database")).toBeChecked();

        const fieldOrder = waitForUpdateFieldOrder(page);
        await moveDnDKitElement(getSortableField(page, "ID"), {
          vertical: 50,
        });
        await fieldOrder;
        await verifyAndCloseToastFirst(page, "Field order updated");

        // should not show loading state after an update (metabase#56482)
        await expectNoLoadingIndicator(page);

        await expect(getSortOrderRadio(page, "custom")).toBeChecked();

        await openProductsTable(page);
        await assertTableData(page, {
          columns: [
            "Ean",
            "ID",
            "Title",
            "Category",
            "Vendor",
            "Price",
            "Rating",
            "Created At",
          ],
        });
      });

      test("should allow switching to predefined order after drag & drop (metabase#56482)", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        await TableSection.clickFieldsTab(page);
        await TableSection.getSortButton(page).click();
        await expect(getSortOrderRadio(page, "database")).toBeChecked();

        let fieldOrder = waitForUpdateFieldOrder(page);
        await moveDnDKitElement(getSortableField(page, "ID"), {
          vertical: 50,
        });
        await fieldOrder;
        await verifyAndCloseToastFirst(page, "Field order updated");

        // should not show loading state after an update (metabase#56482)
        await expectNoLoadingIndicator(page);

        await expect(getSortableFields(page).nth(0)).toHaveText("Ean");
        await expect(getSortableFields(page).nth(1)).toHaveText("ID");

        await expect(getSortOrderRadio(page, "custom")).toBeChecked();

        // should allow switching to predefined order afterwards (metabase#56482)
        const tableUpdate = waitForTableUpdate(page);
        await getSortOrderOption(page, "Database order").click();
        await tableUpdate;

        await expect(getSortOrderRadio(page, "database")).toBeChecked();
        await expect(getSortableFields(page).nth(0)).toHaveText("ID");
        await expect(getSortableFields(page).nth(1)).toHaveText("Ean");

        // should allow drag & drop afterwards (metabase#56482) — extra sanity check
        fieldOrder = waitForUpdateFieldOrder(page);
        await moveDnDKitElement(getSortableField(page, "ID"), {
          vertical: 50,
        });
        await fieldOrder;

        // should not show loading state after an update (metabase#56482)
        await expectNoLoadingIndicator(page);

        await expect(getSortableFields(page).nth(0)).toHaveText("Ean");
        await expect(getSortableFields(page).nth(1)).toHaveText("ID");
      });
    });

    test.describe("Sync options", () => {
      test("should allow to sync table schema, re-scan field values, and discard cached field values from the actions menu", async ({
        page,
      }) => {
        const waitForAction = (path: string) =>
          page.waitForResponse(
            (response) =>
              response.request().method() === "POST" &&
              new URL(response.url()).pathname === path,
          );

        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: PRODUCTS_ID,
        });

        // re-sync schema
        await getActionsMenuButton(page).click();
        let action = waitForAction("/api/data-studio/table/sync-schema");
        await menu(page).getByText("Re-sync schema", { exact: true }).click();
        await action;
        await verifyAndCloseToastFirst(page, "Sync triggered");

        // re-scan field values
        await getActionsMenuButton(page).click();
        action = waitForAction("/api/data-studio/table/rescan-values");
        await menu(page)
          .getByText("Re-scan field values", { exact: true })
          .click();
        await action;
        await verifyAndCloseToastFirst(page, "Scan triggered");

        // discard cached field values
        await getActionsMenuButton(page).click();
        action = waitForAction("/api/data-studio/table/discard-values");
        await menu(page)
          .getByText("Discard cached field values", { exact: true })
          .click();
        await action;
        await verifyAndCloseToastFirst(page, "Discard triggered");
      });
    });
  });

  test.describe("Field section", () => {
    // H.resetSnowplow() + H.enableTracking(): the capture installed in the
    // outer beforeEach starts empty per test and forces tracking on
    // client-side, so both are already satisfied.
    test.afterEach(() => {
      // Structural stand-in for H.expectNoBadSnowplowEvents (no Iglu
      // validation without snowplow-micro).
      expectNoBadSnowplowEvents(capture);
    });

    test.describe("Metadata", () => {
      test("should allow analysts to change the foreign key target without data access", async ({
        page,
        mb,
      }) => {
        await setUserAsAnalyst(mb.api, NODATA_USER_ID);
        await mb.signIn("nodata");

        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.USER_ID,
        });

        await expect(FieldSection.getSemanticTypeFkTarget(page)).toHaveValue(
          "People → ID",
        );
        const fieldUpdate = waitForFieldUpdate(page);
        await FieldSection.getSemanticTypeFkTarget(page).click();
        await expect(
          popover(page).getByText("Reviews → ID", { exact: true }),
        ).toBeVisible();
        await clickPopoverOption(page, "Products → ID");
        await fieldUpdate;
        await expect(undoToast(page).first()).toContainText(
          "Semantic type of User ID updated",
        );
        await expect(FieldSection.getSemanticTypeFkTarget(page)).toHaveValue(
          "Products → ID",
        );

        // verify preview is blocked without data permissions
        const dataset = waitForDataset(page);
        await FieldSection.getPreviewButton(page).click();
        await dataset;
        await expect(
          PreviewSection.get(page).getByText(
            "Sorry, you don’t have permission to see that.",
            { exact: true },
          ),
        ).toBeVisible();

        // verify FK target change works in query builder as normal user
        await mb.signInAsNormalUser();
        await openTable(page, {
          database: SAMPLE_DB_ID,
          table: ORDERS_ID,
          mode: "notebook",
        });
        await icon(page, "join_left_outer").click();
        await miniPicker(page)
          .getByText("Sample Database", { exact: true })
          .click();
        // The picker's rows are reused across renders, so a locator resolved
        // against a half-loaded list can click the wrong table (PORTING).
        // Gate on the list having settled before clicking.
        await expect(
          miniPicker(page).getByText("Reviews", { exact: true }),
        ).toBeVisible();
        await miniPicker(page).getByText("Products", { exact: true }).click();
        await expect(
          page.getByLabel("Left column", { exact: true }),
        ).toContainText("User ID");
      });
    });

    test.describe("Behavior", () => {
      test.describe("Display values", () => {
        test("should allow analysts to change display values to use foreign key without data access", async ({
          page,
          mb,
        }) => {
          await setUserAsAnalyst(mb.api, NODATA_USER_ID);
          await mb.signIn("nodata");

          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.PRODUCT_ID,
          });

          const dimension = waitForUpdateFieldDimension(page);
          await getDisplayValuesInput(page).click();
          await clickPopoverOption(page, "Use foreign key");
          await clickPopoverOption(page, "Title");
          await dimension;
          await expect(undoToast(page).first()).toContainText(
            "Display values of Product ID updated",
          );

          await expect(getDisplayValuesInput(page)).toHaveValue(
            "Use foreign key",
          );
          await expect(getDisplayValuesFkTargetInput(page)).toHaveValue(
            "Title",
          );

          // verify preview is blocked without data permissions
          const dataset = waitForDataset(page);
          await FieldSection.getPreviewButton(page).click();
          await dataset;
          await expect(
            PreviewSection.get(page).getByText(
              "Sorry, you don’t have permission to see that.",
              { exact: true },
            ),
          ).toBeVisible();

          // verify display value change works as normal user
          await mb.signInAsNormalUser();
          await openReviewsTable(page, { limit: 1 });
          await expect(
            main(page).getByText("Rustic Paper Wallet", { exact: true }),
          ).toBeVisible();
        });

        test("should disable custom mapping for analysts without data access", async ({
          page,
          mb,
        }) => {
          await setUserAsAnalyst(mb.api, NODATA_USER_ID);
          await mb.signIn("nodata");

          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });

          // verify custom mapping is disabled without data access
          await getDisplayValuesInput(page).click();
          const originalValue = popover(page).getByRole("option", {
            name: /Use original value/,
          });
          await expect(originalValue).toBeVisible();
          await expect(originalValue).not.toHaveAttribute(
            "data-combobox-disabled",
          );
          const customMapping = popover(page).getByRole("option", {
            name: /Custom mapping/,
          });
          await expect(customMapping).toBeVisible();
          await expect(customMapping).toHaveAttribute(
            "data-combobox-disabled",
            "true",
          );

          // verify admin can set up custom mapping
          await mb.signInAsAdmin();
          await visit(page, {
            databaseId: SAMPLE_DB_ID,
            schemaId: SAMPLE_DB_SCHEMA_ID,
            tableId: REVIEWS_ID,
            fieldId: REVIEWS.RATING,
          });
          let fieldValues = waitForUpdateFieldValues(page);
          await getDisplayValuesInput(page).click();
          await clickPopoverOption(page, "Custom mapping");
          await fieldValues;
          await expect(undoToast(page).first()).toContainText(
            "Display values of Rating updated",
          );
          await closeToast(page);

          // The remapping modal fetches the field's values and re-renders its
          // rows; resolving the LAST row first proves the list finished
          // rendering, otherwise the first row detaches mid-click (Cypress's
          // command queue paced past this). No new magic numbers — "1" and
          // "5" are the values upstream already pins.
          const five = await findByDisplayValue(modal(page), "5");
          const one = await findByDisplayValue(modal(page), "1");
          await one.click();
          await expect(one).toBeFocused();
          await one.press("ControlOrMeta+A");
          await one.press("Backspace");
          await one.pressSequentially("Terrible");
          await five.click();
          await expect(five).toBeFocused();
          await five.press("ControlOrMeta+A");
          await five.press("Backspace");
          await five.pressSequentially("Amazing");
          fieldValues = waitForUpdateFieldValues(page);
          await modal(page)
            .getByRole("button", { name: "Save", exact: true })
            .click();
          await fieldValues;
          await expect(undoToast(page).first()).toContainText(
            "Display values of Rating updated",
          );

          // verify custom mapping works as normal user
          await mb.signInAsNormalUser();
          await openReviewsTable(page);
          await expect(
            main(page).getByText("Terrible", { exact: true }),
          ).toBeVisible();
          // findAllByText(...).should("be.visible") is an ANY-of-set assertion
          // (PORTING rule 3).
          await expect(
            main(page)
              .getByText("Amazing", { exact: true })
              .filter({ visible: true })
              .first(),
          ).toBeVisible();
        });
      });
    });
  });

  test.describe("Preview section", () => {
    test.describe("Esc key", () => {
      test("should allow closing the preview with Esc key", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        await expect(PreviewSection.get(page)).toHaveCount(0);

        await FieldSection.getPreviewButton(page).click();
        await PreviewSection.get(page).scrollIntoViewIfNeeded();
        await expect(PreviewSection.get(page)).toBeVisible();

        await parkMouseAwayFromTooltips(page);
        await page.keyboard.press("Escape");
        await expect(PreviewSection.get(page)).toHaveCount(0);
      });

      test("should not close the preview when hitting Esc key while modal is open", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        await FieldSection.getPreviewButton(page).click();
        await PreviewSection.get(page).scrollIntoViewIfNeeded();
        await expect(PreviewSection.get(page)).toBeVisible();

        await getFieldValuesButton(page).click();
        await expect(modal(page)).toBeVisible();

        await parkMouseAwayFromTooltips(page);
        await page.keyboard.press("Escape");
        await expect(modal(page)).toHaveCount(0);
        await expect(PreviewSection.get(page)).toBeVisible();
      });

      test("should not close the preview when hitting Esc key while popover is open", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        await FieldSection.getPreviewButton(page).click();
        await PreviewSection.get(page).scrollIntoViewIfNeeded();
        await expect(PreviewSection.get(page)).toBeVisible();

        await FieldSection.getSemanticTypeInput(page).click();
        await expect(popover(page)).toBeVisible();

        await parkMouseAwayFromTooltips(page);
        await page.keyboard.press("Escape");
        // popover({ skipVisibilityCheck: true }).should("not.be.visible"):
        // the node may stay mounted, so assert no VISIBLE popover remains —
        // which is what the shared popover() locator resolves.
        await expect(popover(page)).toHaveCount(0);
        await PreviewSection.get(page).scrollIntoViewIfNeeded();
        await expect(PreviewSection.get(page)).toBeVisible();
      });

      test("should not close the preview when hitting Esc key while command palette is open", async ({
        page,
      }) => {
        await visit(page, {
          databaseId: SAMPLE_DB_ID,
          schemaId: SAMPLE_DB_SCHEMA_ID,
          tableId: ORDERS_ID,
          fieldId: ORDERS.PRODUCT_ID,
        });

        await FieldSection.getPreviewButton(page).click();
        await PreviewSection.get(page).scrollIntoViewIfNeeded();
        await expect(PreviewSection.get(page)).toBeVisible();

        await openCommandPalette(page);
        await expect(commandPalette(page)).toBeVisible();

        await parkMouseAwayFromTooltips(page);
        await page.keyboard.press("Escape");
        await expect(commandPalette(page)).toHaveCount(0);
        await expect(PreviewSection.get(page)).toBeVisible();
      });
    });

    test.describe("Empty states", () => {
      test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

      test.beforeEach(async ({ mb }) => {
        await mb.restore("postgres-writable");
        await mb.signInAsAdmin();
        await mb.api.activateToken("pro-self-hosted");
        await resetTestTableMultiSchema();
        await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });
        await queryWritableDB('delete from "Domestic"."Animals"');
      });

      test(
        "should show empty state when there is no data",
        { tag: "@external" },
        async ({ page }) => {
          await visit(page);

          await TablePicker.getDatabase(page, "Writable Postgres12").click();
          await TablePicker.getSchema(page, "Domestic").click();
          await TablePicker.getTable(page, "Animals").click();
          await TableSection.clickFieldsTab(page);
          await TableSection.clickField(page, "Name");
          await FieldSection.getPreviewButton(page).click();

          await PreviewSection.get(page).scrollIntoViewIfNeeded();
          await expect(
            PreviewSection.get(page).getByText("No data to show", {
              exact: true,
            }),
          ).toBeVisible();
          await PreviewSection.getPreviewTypeInput(page)
            .getByText("Detail", { exact: true })
            .click();
          await expect(
            PreviewSection.get(page).getByText("No data to show", {
              exact: true,
            }),
          ).toBeVisible();
        },
      );
    });

    test("should not auto-focus inputs in filtering preview", async ({
      page,
    }) => {
      await visit(page, {
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.PRODUCT_ID,
      });

      await FieldSection.getPreviewButton(page).click();
      await PreviewSection.getPreviewTypeInput(page)
        .getByText("Filtering", { exact: true })
        .click();

      let input = PreviewSection.get(page).getByPlaceholder("Enter an ID", {
        exact: true,
      });
      await expect(input).toBeVisible();
      await expect(input).not.toBeFocused();

      await getFilteringInput(page).click();
      await clickPopoverOption(page, "A list of all values");

      input = PreviewSection.get(page).getByPlaceholder("Search the list", {
        exact: true,
      });
      await expect(input).toBeVisible();
      await expect(input).not.toBeFocused();

      await TableSection.clickField(page, "Tax");

      input = PreviewSection.get(page).getByPlaceholder("Min", {
        exact: true,
      });
      await expect(input).toBeVisible();
      await expect(input).not.toBeFocused();

      await getFilteringInput(page).click();
      await clickPopoverOption(page, "Search box");

      input = PreviewSection.get(page).getByPlaceholder("Enter a number", {
        exact: true,
      });
      await expect(input).toBeVisible();
      await expect(input).not.toBeFocused();
    });

    test("should not crash when viewing filtering preview of a hidden table", async ({
      page,
    }) => {
      await visit(page, {
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      await clickDetailsTab(page);
      const tableUpdate = waitForTableUpdate(page);
      await getVisibilityTypeInput(page).click();
      await clickPopoverOption(page, "Hidden");
      await tableUpdate;

      await TableSection.clickFieldsTab(page);
      await TableSection.clickField(page, "Product ID");

      await FieldSection.getPreviewButton(page).click();
      await PreviewSection.getPreviewTypeInput(page)
        .getByText("Filtering", { exact: true })
        .click();
      await expect(
        PreviewSection.get(page).getByPlaceholder("Enter an ID", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Something’s gone wrong", { exact: true }),
      ).toHaveCount(0);
    });
  });

  test("should allow you to close table and field details", async ({
    page,
  }) => {
    await visit(page, {
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.PRODUCT_ID,
    });

    await FieldSection.getPreviewButton(page).click();

    await expect(PreviewSection.get(page)).toHaveCount(1);

    await getFieldSectionCloseButton(page).click();

    await expect(PreviewSection.get(page)).toHaveCount(0);
    await expect(FieldSection.get(page)).toHaveCount(0);
    await expect(TableSection.get(page)).toHaveCount(1);

    await getTableSectionCloseButton(page).click();
    await expect(TableSection.get(page)).toHaveCount(0);

    // ensure that preview opened state was cleared and does not re-appear
    await TablePicker.getTable(page, "Orders").click();
    await TableSection.clickFieldsTab(page);
    await TableSection.clickField(page, "Subtotal");
    await expect(FieldSection.get(page)).toHaveCount(1);
    await expect(TableSection.get(page)).toHaveCount(1);
    await expect(PreviewSection.get(page)).toHaveCount(0);
  });
});
