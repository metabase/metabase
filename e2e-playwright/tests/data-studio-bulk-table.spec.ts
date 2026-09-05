/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/data-model/data-studio-bulk-table.cy.spec.ts
 *
 * Collision checks (PORTING "same-basename siblings"):
 * - Source dir holds only `.ts` specs; there is no `data-studio-bulk-table.cy.spec.js`
 *   twin, so this is not one of the three known disjoint `.js`/`.ts` pairs.
 * - `grep -rl "data-studio-bulk-table" tests/ support/` matched nothing before
 *   this port; the neighbouring `datamodel-data-studio*`, `data-studio-tables`,
 *   `data-studio-library`, `data-studio-metrics`, `data-studio-snippets`,
 *   `measures-data-studio`, `segments-data-studio` modules were all read and
 *   are ports of DIFFERENT sources. Nothing was overwritten.
 * - Support module name is the conventional `support/data-studio-bulk-table.ts`
 *   (NO deviation — nothing else imports it, no dangling-import risk).
 *
 * Gate mapping (verified per describe, not by a whole-file scan):
 * - There is ONE top-level describe, "bulk table operations". Five of its
 *   tests carry `{ tags: ["@external"] }` individually; the nested describe
 *   "several databases with several schemas at once (GDGT-1275)" carries the
 *   tag on the describe, so its 2 tests inherit it. 7/7 tests are @external,
 *   which is why the queue reported the gate unqualified.
 * - The tag is ACCURATE for all 7: every test restores the `postgres-writable`
 *   snapshot and drives the writable QA postgres (writable_db on :5404).
 *   Two of them additionally write directly to that container
 *   (`multi_schema` / `many_schemas` fixtures).
 * - Gated on the deliberate `PW_QA_DB_ENABLED` (never the bare `QA_DB_ENABLED`,
 *   which leaks truthy from cypress.env.json). Gate-ON vs gate-OFF control
 *   results are in findings-inbox/data-studio-bulk-table.md.
 * - The `WRITABLE_DB_ID` red herring does NOT apply as a red herring here:
 *   under the `postgres-writable` snapshot database 2 genuinely IS the writable
 *   container (verified on `name` = "Writable Postgres12"), so these tests are
 *   fully exposed to FINDINGS #85 contamination of the shared container.
 *
 * Token gate (traced, both sides):
 * - `H.activateToken("pro-self-hosted")` -> `mb.api.activateToken(...)`.
 * - BE: `/api/ee/data-studio/*` is registered as
 *   `(premium-handler metabase-enterprise.data-studio.api/routes :library)`
 *   (enterprise/backend/src/metabase_enterprise/api_routes/routes.clj:117),
 *   i.e. `ee.api/+require-premium-feature :library`. `enable-library?` is a
 *   plain `(define-premium-feature ... :library)` whose getter is
 *   `default-premium-feature-getter` — NO short-circuit of the
 *   `query-transforms-enabled?`/`(not is-hosted?)` kind, so the feature really
 *   does gate `publish-tables` / `unpublish-tables`.
 * - FE: `hasPremiumFeature("library")` sets `PLUGIN_LIBRARY.isEnabled`
 *   (enterprise/frontend/src/metabase-enterprise/data-studio/library/index.ts:24),
 *   which is what renders the Published column, the Publish/Unpublish buttons
 *   and the Publish/Unpublish modals. Without the token those surfaces are
 *   simply absent — five of the seven tests could not run at all.
 * - The non-EE `/api/data-studio/table/{sync-schema,rescan-values,discard-values}`
 *   endpoints used by "syncing multiple tables" are NOT library-gated; that test
 *   still needs the token for the picker's bulk toolbar to render as upstream
 *   expects it.
 *
 * Snowplow vantage: the BROWSER BOUNDARY (`installSnowplowCapture`).
 * All six asserted events come from FE `trackSimpleEvent` call sites in
 * `frontend/src/metabase/common/data-studio/analytics.ts`, so the per-slot
 * collector would never see them — `installSnowplowCapture`'s `page.route`
 * fulfils the tracker POST before it leaves the browser. The assertions are
 * exact counts, which is the second reason the boundary is right (the collector
 * accumulates across the whole worker lifetime). `H.resetSnowplow()` in the
 * upstream `beforeEach` maps to `capture.reset()`; it is NOT dead setup here —
 * six assertions depend on it.
 *
 * Port notes:
 * - `{ viewportWidth: 1600 }` on the describe -> `test.use({ viewport })`.
 *   Cypress's configured height is 800 (e2e/support/config.js:301). This also
 *   sidesteps the known 1280x720 harness defect for this file.
 * - All six `cy.intercept(...).as(...)` aliases are awaited somewhere, so all
 *   six are ported as `waitForResponse` predicates registered BEFORE their
 *   triggering action (rule 2). None is a retroactive-queue case.
 * - Multi-select safety: PORTING/#brief warns that a "select all" loop can
 *   silently un-check a previously checked row. Playwright's `check()` already
 *   verifies its own subject, but that does not cover row 0 being un-checked by
 *   row 1, so each test additionally asserts every checkbox it ticked is still
 *   checked. That is a port-safety assertion, not an upstream one — declared
 *   here rather than left implicit.
 */
import {
  TablePicker,
  visitDataModel,
  resetTestTableMultiSchema,
} from "../support/data-model";
import {
  dataStudioNav,
  libraryPage,
  tableItem,
} from "../support/data-studio-library";
import {
  expectTableAction,
  getDatabaseToggle,
  getTableId,
  getTableInSchema,
  resetTestTableManySchemas,
  setBulkAttribute,
  treeTableItems,
  undoToastList,
  undoToastListContainer,
  waitForDiscardValues,
  waitForPublishTables,
  waitForRescanValues,
  waitForSchema,
  waitForSyncSchema,
  waitForUnpublishTables,
  type Table,
} from "../support/data-studio-bulk-table";
import { expect, test } from "../support/fixtures";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import {
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
  type SnowplowCapture,
} from "../support/search-snowplow";
import { modal } from "../support/ui";

const WRITABLE_DB_NAME = "Writable Postgres12";

test.describe("bulk table operations", () => {
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable QA Postgres database (writable_db on :5404) and the postgres-writable snapshot (set PW_QA_DB_ENABLED)",
  );

  // Upstream: `describe(..., { viewportWidth: 1600 })`. Cypress's configured
  // height is 800 (e2e/support/config.js:301).
  test.use({ viewport: { width: 1600, height: 800 } });

  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    // H.resetSnowplow() — the browser-boundary capture must be installed
    // before the first navigation (the tracker is built during app bootstrap).
    capture = await installSnowplowCapture(page, mb.baseUrl);
    capture.reset();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("syncing multiple tables", async ({ page, mb }) => {
    await mb.restore("postgres-writable");
    await mb.api.activateToken("pro-self-hosted");
    // Re-authenticate after restoring the writable-DB snapshot, like the
    // sibling tests do (upstream comment).
    await mb.signInAsAdmin();
    await visitDataModel(page, "data studio");

    const schema = waitForSchema(page, WRITABLE_DB_ID);
    await TablePicker.getDatabase(page, WRITABLE_DB_NAME).click();
    // Wait for the UI to load the database's tables before interacting.
    await schema;

    // Upstream deliberately reads the table ids from a direct API request
    // rather than the intercepted UI response (the aliased body was
    // occasionally a non-array under stress).
    const tables = (await (
      await mb.api.get(
        `/api/database/${WRITABLE_DB_ID}/schema/public?include_hidden=true`,
      )
    ).json()) as Table[];
    const tableIds = [
      getTableId(tables, "Orders"),
      getTableId(tables, "Products"),
    ];

    const ordersCheckbox = TablePicker.getTable(page, "Orders").locator(
      'input[type="checkbox"]',
    );
    const productsCheckbox = TablePicker.getTable(page, "Products").locator(
      'input[type="checkbox"]',
    );
    await ordersCheckbox.check();
    await productsCheckbox.check();
    // Port-safety: checking row 1 must not have un-checked row 0.
    await expect(ordersCheckbox).toBeChecked();
    await expect(productsCheckbox).toBeChecked();

    await expect(
      page.getByRole("heading", { name: /2 tables selected/ }),
    ).toHaveCount(1);

    await page.getByRole("button", { name: /Sync settings/ }).click();
    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_bulk_sync_settings_clicked",
    });

    const syncSchema = waitForSyncSchema(page);
    await page.getByRole("button", { name: /Sync table schemas/ }).click();
    await expect(
      page.getByRole("button", { name: /Sync triggered!/ }),
    ).toBeVisible();
    await expectTableAction(await syncSchema, tableIds);
    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_table_schema_sync_started",
      result: "success",
    });

    const rescanValues = waitForRescanValues(page);
    await page.getByRole("button", { name: /Re-scan tables/ }).click();
    await expect(
      page.getByRole("button", { name: /Scan triggered!/ }),
    ).toBeVisible();
    await expectTableAction(await rescanValues, tableIds);
    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_table_fields_rescan_started",
      result: "success",
    });

    const discardValues = waitForDiscardValues(page);
    await page
      .getByRole("button", { name: /Discard cached field values/ })
      .click();
    await expect(
      page.getByRole("button", { name: /Discard triggered!/ }),
    ).toBeVisible();
    await expectTableAction(await discardValues, tableIds);
    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_table_field_values_discard_started",
      result: "success",
    });
  });

  test("allows publishing and unpublishing multiple tables", async ({
    page,
    mb,
  }) => {
    await mb.restore("postgres-writable");
    await mb.api.activateToken("pro-self-hosted");
    await mb.signInAsAdmin();
    await visitDataModel(page, "data studio");

    // "select multiple tables" — the picker tree keeps mounting after the
    // databases request resolves, so upstream waits for the expand toggle to
    // render collapsed, clicks it, then confirms it expanded.
    const toggle = getDatabaseToggle(
      TablePicker.getDatabase(page, WRITABLE_DB_NAME),
    );
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const schema = waitForSchema(page, WRITABLE_DB_ID);
    await toggle.click();
    await schema;
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const orders = TablePicker.getTable(page, "Orders").getByRole("checkbox");
    const products = TablePicker.getTable(page, "Products").getByRole(
      "checkbox",
    );
    const reviews = TablePicker.getTable(page, "Reviews").getByRole("checkbox");
    await orders.check();
    await products.check();
    await reviews.check();
    await expect(orders).toBeChecked();
    await expect(products).toBeChecked();
    await expect(reviews).toBeChecked();

    // "publish the tables and verify they are published".
    // No library exists yet, so `hasLibrary` is false and only the "Publish"
    // button renders — /Publish/ cannot also match "Unpublish" at this point.
    await page.getByRole("button", { name: /Publish/ }).click();
    await modal(page).getByText("Create my Library", { exact: true }).click();
    const publish = waitForPublishTables(page);
    await modal(page).getByText("Publish these tables", { exact: true }).click();
    await publish;

    // The modal must be gone before any navigation whose history entry we
    // later `goBack()` to (bfcache restores the frozen DOM — PORTING wave 12).
    await expect(modal(page)).toHaveCount(0);

    const toasts = undoToastListContainer(page);
    await expect(toasts.getByText("Published", { exact: true })).toBeVisible();
    await toasts.getByRole("button", { name: /Go to Data/ }).click();

    await expect(tableItem(page, "Orders")).toBeVisible();
    await expect(tableItem(page, "Products")).toBeVisible();
    await page.goBack();

    // "unpublish some tables and verify they are unpublished"
    const ordersAgain = TablePicker.getTable(page, "Orders").getByRole(
      "checkbox",
    );
    const productsAgain = TablePicker.getTable(page, "Products").getByRole(
      "checkbox",
    );
    await ordersAgain.check();
    await productsAgain.check();
    await expect(ordersAgain).toBeChecked();
    await expect(productsAgain).toBeChecked();

    await page.getByRole("button", { name: /Unpublish/ }).click();
    const unpublish = waitForUnpublishTables(page);
    await modal(page)
      .getByText("Unpublish these tables", { exact: true })
      .click();
    await unpublish;
    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_table_unpublished",
    });

    await dataStudioNav(page).getByLabel("Library", { exact: true }).click();

    const library = libraryPage(page);
    await expect(library.getByText("Reviews", { exact: true })).toBeVisible();
    await expect(library.getByText("Orders", { exact: true })).toHaveCount(0);
    await expect(library.getByText("Products", { exact: true })).toHaveCount(0);
  });

  test("allows to edit attributes for tables", async ({ page, mb }) => {
    await mb.restore("postgres-writable");
    await mb.api.activateToken("pro-self-hosted");
    await mb.signInAsAdmin();
    await visitDataModel(page, "data studio");

    const schema = waitForSchema(page, WRITABLE_DB_ID);
    await TablePicker.getDatabase(page, WRITABLE_DB_NAME).click();
    // wait for the database's tables to load before selecting them
    await schema;

    const orders = TablePicker.getTable(page, "Orders").locator(
      'input[type="checkbox"]',
    );
    const products = TablePicker.getTable(page, "Products").locator(
      'input[type="checkbox"]',
    );
    await orders.check();
    await products.check();
    await expect(orders).toBeChecked();
    await expect(products).toBeChecked();

    await setBulkAttribute(page, "Owner", "Bobby Tables");
    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_bulk_attribute_updated",
      event_detail: "owner",
      result: "success",
    });

    await setBulkAttribute(page, "Visibility layer", "Final");
    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_bulk_attribute_updated",
      event_detail: "layer",
      result: "success",
    });

    await setBulkAttribute(page, "Entity type", "Person");
    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_bulk_attribute_updated",
      event_detail: "entity_type",
      result: "success",
    });

    await setBulkAttribute(page, "Source", "Ingested");
    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_bulk_attribute_updated",
      event_detail: "data_source",
      result: "success",
    });

    await expect(undoToastList(page)).toHaveCount(4);
    await expect(
      TablePicker.getTable(page, "Orders").getByTestId("table-owner"),
    ).toHaveText("Bobby Tables");
    await expect(
      TablePicker.getTable(page, "Products").getByTestId("table-owner"),
    ).toHaveText("Bobby Tables");
  });

  test.describe("several databases with several schemas at once (GDGT-1275)", () => {
    test.beforeEach(async ({ page, mb }) => {
      await mb.restore("postgres-writable");
      await mb.api.activateToken("pro-self-hosted");
      await mb.api.createLibrary();
      await mb.signInAsAdmin();
      await resetTestTableMultiSchema();
      // Upstream passes no `tables`, so the wait degenerates to "the database
      // reports at least one table". Ported as-is; see the findings file for
      // why passing `tables` would not strengthen it here either (the app-DB
      // rows survive the DROP/CREATE with `initial_sync_status: "complete"`).
      await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });
      await visitDataModel(page, "data studio");
    });

    test("should change metadata and see that is changed for all selected tables without filters", async ({
      page,
    }) => {
      // "change the owner and check the owner column"
      await TablePicker.getDatabase(page, WRITABLE_DB_NAME).click();
      await TablePicker.getDatabase(page, "Sample Database").click();
      await TablePicker.getSchema(page, "Domestic").click();

      const accounts = TablePicker.getTable(page, "Accounts").locator(
        'input[type="checkbox"]',
      );
      const animals = TablePicker.getTable(page, "Animals").locator(
        'input[type="checkbox"]',
      );
      await accounts.check();
      await animals.check();
      await expect(accounts).toBeChecked();
      await expect(animals).toBeChecked();

      await setBulkAttribute(page, "Owner", "Bobby Tables");

      for (const tableName of ["Accounts", "Animals"]) {
        await expect(
          TablePicker.getTable(page, tableName).getByTestId("table-owner"),
        ).toHaveText("Bobby Tables");
      }

      // "publish and check publish state column"
      await accounts.check();
      await animals.check();
      await expect(accounts).toBeChecked();
      await expect(animals).toBeChecked();

      await page.getByRole("button", { name: /Publish/ }).click();
      const publish = waitForPublishTables(page);
      await modal(page)
        .getByText("Publish these tables", { exact: true })
        .click();
      await publish;

      for (const tableName of ["Accounts", "Animals"]) {
        await expect(
          TablePicker.getTable(page, tableName)
            .getByTestId("table-published")
            .getByLabel("Published", { exact: true }),
        ).toBeVisible();
      }
    });

    test("should change metadata and see that is changed for all selected tables with filters", async ({
      page,
    }) => {
      // The search box is debounced, so it needs real keystrokes.
      await TablePicker.getSearchInput(page).pressSequentially("a");

      // DECLARED DEVIATION — `Animals` is pinned to the `Domestic` schema.
      // Upstream's bare `getTable("Animals")` is ambiguous in the SEARCH view:
      // measured on this box it resolves to 6 rendered rows out of 28 tables
      // named `Animals` in the app DB (FINDINGS #85 `Schema A`…`Schema Z`
      // debris), and even a pristine container has 2 (this describe's own
      // `multi_schema` fixture creates `Domestic.Animals` AND `Wild.Animals`).
      // `Accounts` is genuinely unique (1 row, Sample Database / PUBLIC —
      // measured), so it keeps the upstream locator unchanged.
      // See findings-inbox/data-studio-bulk-table.md.
      const accountsRow = TablePicker.getTable(page, "Accounts");
      const animalsRow = getTableInSchema(page, {
        databaseId: WRITABLE_DB_ID,
        schemaName: "Domestic",
        tableName: "Animals",
      });

      // "change the owner and check the owner column"
      const accounts = accountsRow.locator('input[type="checkbox"]');
      const animals = animalsRow.locator('input[type="checkbox"]');
      await accounts.check();
      await animals.check();
      await expect(accounts).toBeChecked();
      await expect(animals).toBeChecked();

      await setBulkAttribute(page, "Owner", "Bobby Tables");

      for (const row of [accountsRow, animalsRow]) {
        await expect(row.getByTestId("table-owner")).toHaveText("Bobby Tables");
      }

      // "publish and check publish state column"
      await page.getByRole("button", { name: /Publish/ }).click();
      const publish = waitForPublishTables(page);
      await modal(page)
        .getByText("Publish these tables", { exact: true })
        .click();
      await publish;

      for (const row of [accountsRow, animalsRow]) {
        await expect(
          row
            .getByTestId("table-published")
            .getByLabel("Published", { exact: true }),
        ).toBeVisible();
      }
    });
  });

  test("allows to edit attributes for db", async ({ page, mb }) => {
    await mb.restore("postgres-writable");
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.createLibrary();
    await mb.signInAsAdmin();
    await visitDataModel(page, "data studio");

    // "Expand the rows up front - we'll need them later for the assertion"
    const database = TablePicker.getDatabase(page, WRITABLE_DB_NAME);
    await expect(database).toBeVisible();
    const schema = waitForSchema(page, WRITABLE_DB_ID);
    await database.click();
    await schema;

    const databaseCheckbox = database.locator('input[type="checkbox"]');
    await databaseCheckbox.check();
    await expect(databaseCheckbox).toBeChecked();

    await setBulkAttribute(page, "Owner", "Bobby Tables");
    await setBulkAttribute(page, "Visibility layer", "Final");
    await setBulkAttribute(page, "Entity type", "Person");
    await setBulkAttribute(page, "Source", "Ingested");

    await page.getByRole("button", { name: /Publish/ }).click();
    const publish = waitForPublishTables(page);
    await modal(page).getByText("Publish these tables", { exact: true }).click();
    await publish;

    const tables = treeTableItems(page);
    const count = await tables.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index++) {
      await expect(tables.nth(index).getByTestId("table-owner")).toHaveText(
        "Bobby Tables",
      );
      await expect(
        tables
          .nth(index)
          .getByTestId("table-published")
          .getByLabel("Published", { exact: true }),
      ).toBeVisible();
    }
  });

  test("allows to edit attributes for schema", async ({ page, mb }) => {
    await mb.restore("postgres-writable");
    await mb.api.activateToken("pro-self-hosted");
    await resetTestTableManySchemas();
    await mb.signInAsAdmin();
    // Upstream: `H.resyncDatabase({ dbId, tableName: "Animals" })`. The Cypress
    // helper's `tableName` and `tables` params reduce to the same check; this
    // port only exposes `tables`.
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: ["Animals"],
    });
    await visitDataModel(page, "data studio");

    await TablePicker.getDatabase(page, WRITABLE_DB_NAME).click();
    const schemaA = TablePicker.getSchema(page, "Schema A").locator(
      'input[type="checkbox"]',
    );
    const schemaB = TablePicker.getSchema(page, "Schema B").locator(
      'input[type="checkbox"]',
    );
    await schemaA.check();
    await schemaB.check();
    await expect(schemaA).toBeChecked();
    await expect(schemaB).toBeChecked();

    await page
      .getByRole("heading", { name: /Multiple tables selected/ })
      .click();

    await setBulkAttribute(page, "Owner", "Bobby Tables");
    await setBulkAttribute(page, "Visibility layer", "Final");
    await setBulkAttribute(page, "Entity type", "Person");
    await setBulkAttribute(page, "Source", "Ingested");

    await TablePicker.getSchema(page, "Schema A").click();
    await TablePicker.getSchema(page, "Schema B").click();

    // VACUOUS UPSTREAM ASSERTION, ported verbatim. `loading-placeholder` is
    // rendered only by the LEGACY admin picker
    // (frontend/src/metabase/metadata/pages/DataModelV1/.../Results.tsx:351);
    // the data-studio picker under test never renders that testid, so this can
    // never fail. Kept because the hard rule is weak-but-faithful, and the
    // intent ("wait for the expanded schemas to load") is not unambiguous
    // enough to substitute a different anchor.
    await expect(page.getByTestId("loading-placeholder")).toHaveCount(0);

    const tables = treeTableItems(page);
    const count = await tables.count();
    for (let index = 0; index < count; index++) {
      await expect(tables.nth(index).getByTestId("table-owner")).toHaveText(
        "Bobby Tables",
      );
    }
  });
});
