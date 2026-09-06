/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/data-model/data-studio-single-table.cy.spec.ts
 * (272 lines, 5 tests in 2 describes).
 *
 * Collision checks
 * ----------------
 * - `grep -rl "data-studio-single-table" tests/ support/` matched NOTHING before
 *   this port, so no port of this source existed and nothing was overwritten.
 * - The named-at-risk neighbours were read first and are ports of DIFFERENT
 *   sources: `data-studio-bulk-table` (…/data-studio-bulk-table.cy.spec.ts),
 *   `datamodel-data-studio`, `data-model-shared-1..4`, `data-studio-tables`,
 *   `data-studio-library`, `data-studio-metrics`, `data-studio-snippets`.
 * - Support module is the CONVENTIONAL `support/data-studio-single-table.ts`.
 *   NO deviation. Nothing else imports it, so there is no dangling-import risk.
 *
 * Gate mapping (read from the `beforeEach` and each `it`, not a file scan)
 * -----------------------------------------------------------------------
 * | describe                    | tests | tag on                | accurate? |
 * |-----------------------------|-------|-----------------------|-----------|
 * | `Table editing` (direct its)| 4     | `@external` per `it`  | yes       |
 * | ↳ `with remote sync enabled`| 1     | `@external` on the `it`| yes      |
 *
 * 5/5 tests are `@external` and the tag is ACCURATE for all five: three restore
 * `mysql-8` (QA MySQL8 container), one restores `postgres-12` (QA Postgres12),
 * one restores `postgres-writable` and writes the `many_schemas` fixture into
 * the writable container. Gated on the deliberate `PW_QA_DB_ENABLED`, never the
 * bare `QA_DB_ENABLED` (which leaks truthy from cypress.env.json).
 *
 * 🔴 TAG DRIFT, reported rather than fixed: the queue lists a `snowplow` gate,
 * but NO test in this file carries an `@snowplow` tag — the only tags present
 * are `@external`. The file nevertheless calls `H.resetSnowplow()` in its
 * `beforeEach` AND makes a real `H.expectUnstructuredSnowplowEvent` assertion in
 * the publish test. So this is the OPPOSITE of the "dead setup" case in the
 * brief: the snowplow setup is live and load-bearing, but untagged. Ported
 * faithfully (the assertion is kept and executes); the missing upstream tag is
 * recorded in findings-inbox/data-studio-single-table.md.
 *
 * The remote-sync describe gets an `afterEach` (repo teardown), so per the brief
 * its gate is applied at DESCRIBE level, not inside the test body.
 *
 * Token gate — TWO predicates, split by test (traced, both arms controlled)
 * ------------------------------------------------------------------------
 * `H.activateToken("pro-self-hosted")` appears in the `beforeEach` AND again in
 * every test body (each test's `H.restore(...)` wipes the token, so the second
 * activation is load-bearing, not redundant). The predicates are:
 *
 *  - **`:library`** — gates publish/unpublish. BE:
 *    `enterprise/backend/src/metabase_enterprise/api_routes/routes.clj` registers
 *    `"/data-studio"` under `premium-handler … :library`
 *    (= `ee.api/+require-premium-feature`), so `publish-tables` /
 *    `unpublish-tables` 402 without it. FE: `hasPremiumFeature("library")` sets
 *    `PLUGIN_LIBRARY.isEnabled`
 *    (enterprise/frontend/src/metabase-enterprise/data-studio/library/index.ts:23),
 *    and `DataStudioLayout.tsx:100` uses `useHasTokenFeature("library")` to mark
 *    the Library nav item `isGated`. Hard gate, no short-circuit — `enable-library?`
 *    is a plain `define-premium-feature` with the default getter.
 *  - **`:dependencies`** — a SECOND, distinct predicate this spec depends on and
 *    the sibling bulk-table port did not touch:
 *    `enterprise/frontend/src/metabase-enterprise/dependencies/index.ts:15`
 *    (`hasPremiumFeature("dependencies")`) is what mounts the
 *    `data-testid="dependency-graph"` page
 *    (…/dependencies/components/DependencyGraph/DependencyGraph.tsx:130) and the
 *    "Dependency graph" link / Dependencies + Dependents rows asserted by the
 *    metadata test.
 *
 * Both features ship in `pro-self-hosted`. The two-arm control and the
 * confirmation that the token was RESTORED are in the findings file; no token
 * value is printed anywhere.
 *
 * Snowplow vantage: the BROWSER BOUNDARY, and why
 * ----------------------------------------------
 * The one asserted event, `data_studio_table_published`, is emitted by an FE
 * `trackSimpleEvent` at `frontend/src/metabase/common/data-studio/analytics.ts:13`
 * — a FRONTEND call site. Decided from that call site, per the brief:
 *  - the per-slot collector is BLIND to FE events (its preflight omits
 *    `Access-Control-Allow-Credentials`, so the `credentials:"include"` POST dies
 *    `net::ERR_FAILED`), so it would never see this event at all; and
 *  - the collector's queue carries a PERSISTENT OFFSET, so an assertion made
 *    against it could pass on a predecessor test's event.
 * `installSnowplowCapture` avoids both: it fulfils the tracker POST inside the
 * browser, is per-page, and `capture.reset()` in `beforeEach` is the faithful
 * map of `H.resetSnowplow()`.
 *
 * Port notes
 * ----------
 * - Of the 15 `cy.intercept(...).as(...)` aliases in the upstream `beforeEach`,
 *   only FOUR are ever awaited (`@metadata`, `@publishTables`,
 *   `@unpublishTables`, `@updateTable`). Those four are ported as
 *   `waitForResponse` predicates registered BEFORE their triggering action
 *   (rule 2). The other eleven — including the `updateFieldSpy` spy, which is
 *   never asserted on — are dropped; porting them would be dead code that `tsc`
 *   cannot flag.
 * - `H.DataModel.visitDataStudio()` is used in its BARE form everywhere here, so
 *   the brief's `visitDataModel` hazard is INAPPLICABLE: the never-firing wait is
 *   the `schema` wait, which `visitDataModel` only registers when a `databaseId`
 *   is supplied. The bare form waits on `databases` only. I checked the
 *   predicate table in support/data-model.ts rather than assuming.
 * - Toast dismissal uses the LOCAL `closeUndoToast` (support/data-studio-single-table.ts),
 *   never the shared `data-model.ts verifyAndCloseToast`; see that helper's
 *   docblock for the `UndoListing.tsx:203` mechanism and why the fix is a
 *   `toHaveCount(0)` gate rather than a `.first()` loosening.
 * - `support/data-model.ts` was NOT edited; the owed fix there was not made.
 */
import { expect, test } from "../support/fixtures";
import {
  TablePicker,
  TableSection,
  replaceValue,
  visitDataModel,
  waitForTableUpdate,
} from "../support/data-model";
import {
  allLibraryTableItems,
  closeUndoToast,
  dropTransformTargetTable,
  resetTestTableManySchemas,
  selectHasValue,
  selectIsDisabled,
  setSelectValue,
  undoToastListContainer,
  waitForPublishTables,
  waitForTableMetadata,
  waitForUnpublishTables,
} from "../support/data-studio-single-table";
import { dataStudioNav, tableItem } from "../support/data-studio-library";
import { DependencyGraph } from "../support/dependency-graph";
import { modal } from "../support/ui";
import { WRITABLE_DB_ID, resyncDatabase } from "../support/schema-viewer";
import { createAndRunMbqlTransform } from "../support/transforms-inspect";
import {
  type RemoteSyncRepo,
  configureGit,
  setupGitSync,
  teardownGitSync,
} from "../support/remote-sync";
import {
  type SnowplowCapture,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";

const EXTERNAL_SKIP_REASON =
  "Requires the QA MySQL8 / Postgres12 / writable-Postgres containers and their " +
  "mysql-8, postgres-12 and postgres-writable snapshots (set PW_QA_DB_ENABLED)";

test.describe("Table editing", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, EXTERNAL_SKIP_REASON);

  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    // H.resetSnowplow() — at the browser boundary (see header for the vantage
    // argument). Installed before any navigation so the init script lands.
    capture = await installSnowplowCapture(page, mb.baseUrl);
    capture.reset();

    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should display metadata information", async ({ page, mb }) => {
    await mb.restore("mysql-8");
    await mb.signInAsAdmin();
    // Each restore wipes the token — this second activation is load-bearing.
    await mb.api.activateToken("pro-self-hosted");

    await visitDataModel(page, "data studio");
    await TablePicker.getDatabase(page, "QA MySQL8").click();

    const metadata = waitForTableMetadata(page);
    await TablePicker.getTable(page, "Orders").click();
    const response = await metadata;
    const { view_count: viewCount } = (await response.json()) as {
      view_count: number;
    };

    await expect(
      page.getByLabel("Name in the database", { exact: true }),
    ).toHaveText("ORDERS");
    // Upstream comment: "Testing the actual value is done in
    // TableMetadata.unit.spec.tsx" — so this really is an existence check.
    await expect(
      page.getByLabel("Last updated at", { exact: true }),
    ).toHaveCount(1);
    await expect(page.getByLabel("View count", { exact: true })).toHaveText(
      String(viewCount ?? 0),
    );
    await expect(
      page.getByLabel("Est. row count", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Dependencies", { exact: true })).toHaveText(
      "0",
    );
    await expect(page.getByLabel("Dependents", { exact: true })).toHaveText("0");

    await TableSection.get(page)
      .getByRole("link", { name: "Dependency graph", exact: true })
      .click();

    await expect(DependencyGraph.graph(page)).toBeVisible();
  });

  test("should publish a single table to a collection and unpublish", async ({
    page,
    mb,
  }) => {
    await mb.restore("mysql-8");
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await visitDataModel(page, "data studio");
    await TablePicker.getDatabase(page, "QA MySQL8").click();
    await TablePicker.getTable(page, "Orders").click();

    // publish the table and verify it's published
    await expect(
      TablePicker.getTable(page, "Orders").getByTestId("table-published"),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /Publish/ }).click();
    await modal(page).getByText("Create my Library").click();

    const published = waitForPublishTables(page);
    await modal(page).getByText("Publish this table").click();
    await published;

    await expect(
      TablePicker.getTable(page, "Orders").getByTestId("table-published"),
    ).toBeVisible();

    const toasts = undoToastListContainer(page);
    await expect(toasts.getByText("Published")).toBeVisible();
    await toasts.getByRole("button", { name: /Go to Data/ }).click();

    await expectUnstructuredSnowplowEvent(capture, {
      event: "data_studio_table_published",
    });

    await expect(tableItem(page, "Orders")).toBeVisible();
    await page.goBack();

    // unpublish the table and verify it's unpublished
    await page.getByRole("button", { name: /Unpublish/ }).click();

    const unpublished = waitForUnpublishTables(page);
    await modal(page).getByText("Unpublish this table").click();
    await unpublished;

    await expect(
      TablePicker.getTable(page, "Orders").getByTestId("table-published"),
    ).toHaveCount(0);
    await dataStudioNav(page).getByLabel("Library", { exact: true }).click();
    await expect(allLibraryTableItems(page)).toHaveCount(0);
  });

  test("should allow to edit attributes", async ({ page, mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    await visitDataModel(page, "data studio");
    await TablePicker.getDatabase(page, "QA Postgres12").click();
    await TablePicker.getTable(page, "Orders").click();

    // rename the table and verify the name is updated in the picker
    const renamed = waitForTableUpdate(page);
    const nameInput = TableSection.getNameInput(page);
    await replaceValue(nameInput, "Renamed Orders");
    await nameInput.blur();
    await renamed;
    await expect(TablePicker.getTable(page, "Renamed Orders")).toBeVisible();
    await closeUndoToast(page);

    await setSelectValue(page, "Owner", "No owner", "Bobby Tables");
    await expect(
      undoToastListContainer(page).getByText("Table owner updated"),
    ).toBeVisible();
    await closeUndoToast(page);

    await setSelectValue(page, "Visibility layer", "Internal", "Final");
    await expect(
      undoToastListContainer(page).getByText("Table visibility layer updated"),
    ).toBeVisible();

    // undo the change and verify the table updates to the reverted value
    const undone = waitForTableUpdate(page);
    await undoToastListContainer(page)
      .getByTestId("toast-undo")
      .filter({ hasText: "Table visibility layer updated" })
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await undone;
    await expect(
      undoToastListContainer(page).getByText("Change undone"),
    ).toBeVisible();
    await closeUndoToast(page);
    await selectHasValue(page, "Visibility layer", "Internal");
    await expect(
      TablePicker.getTable(page, "Orders").getByTestId("table-data-layer"),
    ).toHaveText("Internal");

    await setSelectValue(page, "Entity type", "Transaction", "Person");
    await expect(
      undoToastListContainer(page).getByText("Entity type updated"),
    ).toBeVisible();

    await setSelectValue(page, "Source", "Unspecified", "Ingested");
    await expect(
      undoToastListContainer(page).getByText("Table data source updated"),
    ).toBeVisible();

    // navigate away and back
    await TablePicker.getTable(page, "Products").click();

    // ⚠️ DECLARED STRENGTHENING (an added WAIT, no assertion changed).
    //
    // Found by mutation M4: asserting `Source` = "Unspecified" (Products' value,
    // i.e. the WRONG one) PASSED, even though the settled value is "Ingested".
    // Measured, not inferred — a diagnostic that dumped all four inputs read
    // back `["Bobby Tables","Internal","Person","Ingested"]`, and merely adding
    // that dump's round-trips was enough to make the mutant die.
    //
    // The mechanism is the brief's "an EMPTY-STATE renders PRE-FETCH" family:
    // clicking a table re-renders the section before its `query_metadata` has
    // landed, so the selects transiently show the PREVIOUSLY selected table's
    // values. Cypress's `should("have.value", …)` retries identically, so
    // upstream carries the same race — a wrong expected value would pass there
    // too. Anchoring on the name input alone is NOT sufficient: it flips to
    // "Renamed Orders" before the selects settle (verified — the anchor was
    // tried first and the mutant still survived).
    //
    // Fix is the fetch itself, registered before the click per rule 2, plus the
    // name-input anchor because `waitForResponse` resolves a tick before React
    // commits. The four assertions below are UNCHANGED and verbatim.
    const reselected = waitForTableMetadata(page);
    await TablePicker.getTable(page, "Renamed Orders").click();
    await reselected;
    await expect(TableSection.getNameInput(page)).toHaveValue("Renamed Orders");

    await selectHasValue(page, "Owner", "Bobby Tables");
    await selectHasValue(page, "Visibility layer", "Internal");
    await selectHasValue(page, "Entity type", "Person");
    await selectHasValue(page, "Source", "Ingested");
  });

  test("transform-created table should have link and disabled source edit", async ({
    page,
    mb,
  }) => {
    await mb.restore("postgres-writable");
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    await resetTestTableManySchemas();

    const SOURCE_TABLE = "Animals";
    const TARGET_TABLE = "transform_table";
    const TARGET_SCHEMA = "Schema A";
    const TRANSFORM_TABLE_DISPLAY_NAME = "Transform Table";
    const TRANSFORM_NAME = "Test transform for animals";

    // NO upstream counterpart — see dropTransformTargetTable's docblock. The
    // shared writable container is never reset by our harness, so a leftover
    // `Schema A.transform_table` makes `POST /api/transform` 403. Measured, not
    // guessed: the first run failed with exactly that, and an
    // information_schema probe found the table already present. Must run BEFORE
    // the resync so sync doesn't register the stale table.
    await dropTransformTargetTable(TARGET_SCHEMA, TARGET_TABLE);

    // Upstream passes `tableName: SOURCE_TABLE`; our helper's `tables` array is
    // the same wait (all named tables `initial_sync_status === "complete"`).
    // Deliberately NOT the bare `{ dbId }` form — a stale `complete` status
    // satisfies that instantly.
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [SOURCE_TABLE],
    });

    // Create and run a transform to create a table
    await createAndRunMbqlTransform(mb.api, {
      sourceTable: SOURCE_TABLE,
      targetTable: TARGET_TABLE,
      targetSchema: TARGET_SCHEMA,
      name: TRANSFORM_NAME,
    });

    await visitDataModel(page, "data studio");
    await TablePicker.getDatabase(page, "Writable Postgres12").click();
    await TablePicker.getSchema(page, TARGET_SCHEMA).click();
    await TablePicker.getTable(page, TRANSFORM_TABLE_DISPLAY_NAME).click();

    await expect(
      page.getByRole("link", { name: new RegExp(TRANSFORM_NAME) }),
    ).toBeVisible();

    await selectIsDisabled(page, "Source");
  });

  test.describe("with remote sync enabled", () => {
    let repo: RemoteSyncRepo | undefined;

    test.afterEach(() => {
      teardownGitSync(repo);
      repo = undefined;
    });

    test("should update the tree after publishing, unpublishing, and renaming a table (metabase#69554)", async ({
      page,
      mb,
    }) => {
      await mb.restore("mysql-8");
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-self-hosted");
      repo = setupGitSync();
      await configureGit(mb.api, repo, "read-write");

      await visitDataModel(page, "data studio");
      await TablePicker.getDatabase(page, "QA MySQL8").click();
      await TablePicker.getTable(page, "Orders").click();

      // publish the table and verify the tree updates
      await page.getByRole("button", { name: /Publish/ }).click();
      await modal(page).getByText("Create my Library").click();

      const published = waitForPublishTables(page);
      await modal(page).getByText("Publish this table").click();
      await published;
      await expect(
        TablePicker.getTable(page, "Orders").getByTestId("table-published"),
      ).toBeVisible();

      // unpublish the table and verify the tree updates
      await page.getByRole("button", { name: /Unpublish/ }).click();

      const unpublished = waitForUnpublishTables(page);
      await modal(page).getByText("Unpublish this table").click();
      await unpublished;
      await expect(
        TablePicker.getTable(page, "Orders").getByTestId("table-published"),
      ).toHaveCount(0);

      // rename the table and verify the tree updates
      const renamed = waitForTableUpdate(page);
      const nameInput = TableSection.getNameInput(page);
      await replaceValue(nameInput, "Renamed Orders");
      await nameInput.blur();
      await renamed;
      await expect(TablePicker.getTable(page, "Renamed Orders")).toBeVisible();

      // update the owner and verify it is reflected
      await expect(
        TablePicker.getTable(page, "Renamed Orders"),
      ).not.toContainText("Bobby Tables");

      const ownerUpdated = waitForTableUpdate(page);
      await setSelectValue(page, "Owner", "No owner", "Bobby Tables");
      await ownerUpdated;
      await expect(
        undoToastListContainer(page).getByText("Table owner updated"),
      ).toBeVisible();
      await selectHasValue(page, "Owner", "Bobby Tables");
      await expect(TablePicker.getTable(page, "Renamed Orders")).toContainText(
        "Bobby Tables",
      );
    });
  });
});
