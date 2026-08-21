/**
 * Playwright port of
 * e2e/test/scenarios/admin/databases/database-writable-connection.cy.spec.ts
 *
 * The admin "Writable connection" surface: adding / editing / removing a
 * separate write-credential overlay on a database, its connection-health
 * readout, and the five downstream features that consume it (transforms,
 * transform jobs, model actions, model persistence, editable tables, uploads).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COLLISION CHECKS (done before writing)
 * ─────────────────────────────────────────────────────────────────────────
 * - `grep -rl "database-writable-connection" tests/ support/` matched only
 *   `tests/admin-databases.spec.ts` + `support/admin-databases.ts`, and only
 *   inside their header prose (they name this file as a *neighbour* they are
 *   NOT a port of). No port of this source existed, committed or uncommitted.
 * - Source has no `.js`/`.ts` twin: `e2e/test/scenarios/admin/databases/`
 *   holds only this file and `database-connection-strings.cy.spec.ts`.
 * - Support module is `support/database-writable-connection.ts` — the exact
 *   name the brief asked for. No deviation, so no dangling-import risk.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE MISSING `@external` TAG IS A REAL TAGGING GAP
 * ─────────────────────────────────────────────────────────────────────────
 * The queue reports no `external` tag, and that is accurate: the describe is
 * `describe("scenarios > admin > databases > writable connection", ...)` with
 * NO tag of any kind. It is nonetheless unambiguously container-tier — it
 * restores the `mysql-writable` snapshot and issues raw `CREATE USER` /
 * `CREATE TABLE` against the QA MySQL container via `H.queryWritableDB(…,
 * "mysql")`. Without that container the spec cannot start.
 *
 * This is not a one-off. Auditing every spec that restores a `*-writable`
 * snapshot, ~20 of ~50 carry no `@external` tag, so the convention has drifted
 * repo-wide rather than this file being uniquely wrong. Recorded in
 * findings-inbox as a tagging gap, not worked around: the port gates on
 * PW_QA_DB_ENABLED regardless of what the tag says, per the brief's
 * "probe the gate, don't read the tag" rule.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * INFRA TIER (probed, not assumed) — single describe, two gates
 * ─────────────────────────────────────────────────────────────────────────
 * 1. CONTAINER. `mysql-sample` on :3304 (`writable_db`). Gated on
 *    PW_QA_DB_ENABLED.
 *
 *    `WRITABLE_DB_ID` red herring — CHECKED, and it resolves the *other* way
 *    here, as the brief predicted. After `restore("mysql-writable")`,
 *    `GET /api/database` returns exactly two rows, and database 2 is
 *    `{ name: "Writable MySQL8", engine: "mysql", details.dbname:
 *    "writable_db", host: localhost, port: 3304 }` — the genuinely writable
 *    container, not the read-only QA sample that the literal `2` means under
 *    `postgres-12`. Verified on `name` + `details`, following
 *    `admin-databases.spec.ts`, rather than trusting the constant.
 *
 * 2. TOKEN — and this one is a HARD BLOCK on this box.
 *
 *    Upstream calls `H.activateToken("pro-self-hosted")`. The whole surface
 *    hangs off the `:writable-connection` premium feature, and the LOCAL
 *    `pro-self-hosted` token does not carry it. Probed all four tokens against
 *    this slot (`writable_connection` in `/api/session/properties`):
 *
 *        pro-self-hosted  42 features  writable_connection=false
 *        pro-cloud        44 features  writable_connection=false
 *        starter           4 features  writable_connection=false
 *        bleeding-edge    53 features  writable_connection=TRUE
 *
 *    Per the brief, a missing flag is not a gate until the predicate that
 *    consumes it is read, so both consumers were traced:
 *
 *    - FE: `metabase-enterprise/writable_connection/index.ts` assigns
 *      `PLUGIN_WRITABLE_CONNECTION.WritableConnectionInfoSection` only under
 *      `hasPremiumFeature("writable_connection")`. The OSS default is
 *      `PluginPlaceholder`, which renders `null` — so the section, and every
 *      testid this spec keys on, simply does not exist.
 *    - BE: `PUT /api/database/:id` runs
 *      `assert-has-feature :writable-connection` whenever `write_data_details`
 *      is present (warehouses_rest/api.clj:1104).
 *    - The setting itself is a plain `define-premium-feature
 *      enable-writable-connection? :writable-connection`
 *      (premium_features/settings.clj:367) using the stock
 *      `default-premium-feature-getter` — NO `is-hosted?` short-circuit, i.e.
 *      not the `query-transforms-enabled?` shape that produced the retracted
 *      "transforms are token-blocked" claim. This gate really does fire.
 *
 *    So the token check below is a genuine capability probe, not a tag read.
 *    It is expected to PASS in CI (upstream runs this spec on
 *    `pro-self-hosted`, so CI's token evidently carries the feature); it skips
 *    only where the local token is short. The spec keeps `pro-self-hosted`
 *    verbatim — swapping it to `bleeding-edge` would silently change what
 *    upstream tests.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PORT NOTES
 * ─────────────────────────────────────────────────────────────────────────
 * - `fillInCredentials` uses click + `clear` + `pressSequentially` + blur, NOT
 *   `fill()`. `DatabaseFormFooter` renders the submit as
 *   `disabled={!isDirty}`, the exact Formik-dirty gate that deadlocks `fill()`.
 *   Every submit additionally asserts `toBeEnabled()` first, so a
 *   dirty-tracking regression fails at the button rather than 30s later.
 * - Upstream registers no intercepts and awaits nothing, so there is no
 *   `cy.wait` queue to port and no ResponseRecorder here. The waits that do
 *   exist are the trailing `should("be.visible")` section assertions, which are
 *   real navigation gates (the form is on its own `/write-data` route).
 * - `cy.findByRole("alert").should("contain.text", …)`: `contain.text` is a
 *   CONCATENATION assertion over the matched set. There is exactly one alert on
 *   that screen, so `toContainText` on the single locator is equivalent; a
 *   `toHaveCount(1)` guards the equivalence rather than assuming it.
 * - Health-info locators are scoped to their section. Upstream reaches them
 *   through `.within()`, and unscoped they would be a strict-mode violation
 *   once both sections render one.
 * - `cy.findByLabelText("Model actions").should("be.checked")` → `toBeChecked()`
 *   on the `role="switch"` input; the admin toggles are clicked on the input
 *   with `{ force: true }` per PORTING rule 4.
 * - `expectFailure`/`expectSuccess` are ported as explicit
 *   `>= 400` / `< 400` status assertions, keeping upstream's deliberately loose
 *   bounds. Note these are WEAK-BUT-FAITHFUL: they do not pin a specific status
 *   or message. Recorded, not strengthened, per the faithfulness rule — and the
 *   mutation run below confirms they are still load-bearing.
 * - `resyncDatabase` is called WITH `tables: [ORDERS_TABLE_NAME]` where
 *   upstream passes the bare form. Deliberate, per the brief: the bare wait is
 *   satisfied instantly by a stale `initial_sync_status: "complete"` row, which
 *   is exactly the situation here (the table is created seconds earlier). This
 *   STRENGTHENS the wait; called out rather than left silent.
 * - Cleanup: `afterEach` drops the read-only user and both tables, mirroring
 *   upstream. The database inventory is asserted back to its pre-run shape at
 *   the end of the file — this spec edits an instance-wide connection, and four
 *   other slots share the box.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Resolved (was: workers=2 CI red — global `readonly_user` collision)
 * ─────────────────────────────────────────────────────────────────────────
 * `createUser`/`dropUser` run `CREATE USER` / `DROP USER` on a SERVER-GLOBAL
 * MySQL account — NOT scoped to the per-worker `writable_db_w<slot>` database
 * #157 isolates. Under CI's `--workers=2 --fully-parallel` against ONE shared
 * MySQL container, two of this spec's own tests ran concurrently and worker
 * A's `afterEach` DROP pulled the account out from under worker B mid-test: a
 * connection save targeting the vanished account never navigated back, failing
 * `updateMainConnection`/`updateWritableConnection` at their `toBeVisible`
 * gate for a DIFFERENT subset of tests each run (residual shard-19 red after
 * the `beforeEach` resync hang was fixed by `5cc681aa597` + `15c0f7f7548`).
 *
 * FIX: `READ_ONLY_USERNAME` is now per-slot (`readonly_user_w<slot>`,
 * mirroring `writable_db_w<slot>`), so the two workers no longer share one
 * account. Verified 9×3 at workers=2. Full diagnosis:
 * findings-inbox/database-writable-connection.md.
 */
import type { Page } from "@playwright/test";

import { createAction } from "../support/actions-on-dashboards";
import {
  VALID_CSV_FILES,
  enableUploads,
} from "../support/collections-uploads";
import {
  createTransform,
  runTransformAndWaitForSuccess,
} from "../support/dependency-graph";
import {
  type DatabaseCredentials,
  connectionHealthInfo,
  createWritableConnection,
  enablePersistenceForModel,
  fillInCredentials,
  mainConnectionSection,
  performTableEdit,
  performUpload,
  queryDB,
  refreshModelPersistenceAndAwaitStatus,
  removeWritableConnection,
  runAction,
  runTransformAndWaitForFailure,
  updateMainConnection,
  updateWritableConnection,
  writableConnectionSection,
} from "../support/database-writable-connection";
import type { MetabaseApi } from "../support/api";
import { expect, test } from "../support/fixtures";
import { writableDbName, writableDbSlot } from "../support/writable-db";
import { openQuestionActions } from "../support/models";
import { createCard, createTestNativeQuery } from "../support/native-reproductions";
import { FIRST_COLLECTION_ID } from "../support/sample-data";
import { WRITABLE_DB_ID, getTableId, resyncDatabase } from "../support/schema-viewer";
import {
  createTransformJob,
  createTransformTag,
  waitForSucceededTransformRuns,
} from "../support/transforms";

const QA_DB_SKIP =
  "Requires the QA MySQL container and its mysql-writable snapshot (set PW_QA_DB_ENABLED)";

// Upstream reads these off WRITABLE_DB_CONFIG.mysql.connection
// (e2e/support/cypress_data.js). Transcribed to the same literals the ported
// WRITABLE_DB_CONFIG in support/actions-on-dashboards.ts already carries.
const DEFAULT_USER: DatabaseCredentials = {
  username: "root",
  password: "metasample123",
};

// Per-slot username: CREATE/DROP USER targets a SERVER-GLOBAL MySQL account,
// not the per-worker `writable_db_w<slot>` database, so a shared name collides
// under `--workers=2` (worker A's afterEach DROP yanks it from under worker B).
// Suffix it per slot exactly as writableDbName() does — proven to turn
// workers=2 green (see the header note). Falls back to the plain name when
// isolation is off.
const READ_ONLY_USERNAME = (() => {
  const slot = writableDbSlot();
  return slot === null ? "readonly_user" : `readonly_user_w${slot}`;
})();

const READ_ONLY_USER: DatabaseCredentials = {
  username: READ_ONLY_USERNAME,
  password: "readonly_user",
};

// Per-worker when isolation is on: the GRANT below must name the database
// this worker's database 2 actually points at.
const DATABASE_NAME = writableDbName();
const TRANSFORM_TABLE_NAME = "transform_table";
const ORDERS_TABLE_NAME = "ORDERS";

test.describe("scenarios > admin > databases > writable connection", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP);

  test.beforeEach(async ({ mb }) => {
    await mb.restore("mysql-writable");
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");

    // Capability probe, not a tag read — see the TOKEN section in the header.
    const props = await (await mb.api.get("/api/session/properties")).json();
    const hasWritableConnection =
      props?.["token-features"]?.["writable_connection"] === true;
    test.skip(
      !hasWritableConnection,
      'The active token lacks the "writable-connection" premium feature; ' +
        "the admin section (PluginPlaceholder -> null) and PUT /api/database " +
        "(assert-has-feature) are both hard-gated on it.",
    );

    await mb.api.updateSetting("transforms-enabled", true);
    await createUser(READ_ONLY_USER);
    await setupTableData(mb.api);
  });

  test.afterEach(async () => {
    await dropUser(READ_ONLY_USER);
    await dropTable(ORDERS_TABLE_NAME);
    await dropTable(TRANSFORM_TABLE_NAME);
  });

  test("should be able to create, edit, and remove a writable connection", async ({
    page,
  }) => {
    await visitDatabase(page, WRITABLE_DB_ID);
    await createWritableConnection(page, DEFAULT_USER);
    await updateWritableConnection(page, READ_ONLY_USER);
    await removeWritableConnection(page);
    await expect(
      writableConnectionSection(page).getByText("Add writable connection", {
        exact: true,
      }),
    ).toBeAttached();
  });

  test("should validate writable connection details on save", async ({
    page,
  }) => {
    await visitDatabase(page, WRITABLE_DB_ID);
    await writableConnectionSection(page)
      .getByText("Add writable connection", { exact: true })
      .click();
    await fillInCredentials(page, {
      username: "invalid",
      password: "invalid",
    });

    await page.getByRole("button", { name: "Save", exact: true }).click();

    // `cy.findByRole("alert")` is a single-element query in testing-library;
    // the count assertion keeps `toContainText` equivalent to Cypress's
    // set-concatenating `contain.text`.
    const alert = page.getByRole("alert");
    await expect(alert).toHaveCount(1);
    await expect(alert).toContainText("Metabase tried, but couldn't connect");
  });

  test("should show up-to-date connection health status", async ({ page }) => {
    await visitDatabase(page, WRITABLE_DB_ID);
    await createWritableConnection(page, READ_ONLY_USER);

    await expect(
      connectionHealthInfo(mainConnectionSection(page)),
    ).toHaveText("Connected");
    await expect(
      connectionHealthInfo(writableConnectionSection(page)),
    ).toHaveText("Connected");

    await dropUser(READ_ONLY_USER);
    await visitDatabase(page, WRITABLE_DB_ID);

    await expect(
      connectionHealthInfo(mainConnectionSection(page)),
    ).toHaveText("Connected");
    await expect(
      connectionHealthInfo(writableConnectionSection(page)),
    ).toContainText("Could not connect");
  });

  test("should be able to run transforms with a writable connection", async ({
    page,
    mb,
  }) => {
    await visitDatabase(page, WRITABLE_DB_ID);

    const transform = await createTestTransform(mb.api);

    await updateMainConnection(page, READ_ONLY_USER);
    await runTransformAndWaitForFailure(mb.api, transform.id);

    await createWritableConnection(page, DEFAULT_USER);
    await runTransformAndWaitForSuccess(mb.api, transform.id);
  });

  test("should be able to run transforms via a job with a writable connection", async ({
    page,
    mb,
  }) => {
    await visitDatabase(page, WRITABLE_DB_ID);
    await updateMainConnection(page, READ_ONLY_USER);
    await createWritableConnection(page, DEFAULT_USER);

    const tag = await createTransformTag(mb.api, { name: "New tag" });
    await createTestTransform(mb.api, { tagIds: [tag.id] });
    await createTransformJob(mb.api, {
      schedule: "* * * * * ? *", // every second
      tag_ids: [tag.id],
    });

    await waitForSucceededTransformRuns(mb.api);
  });

  test("should be able to use model actions with a writable connection", async ({
    page,
    mb,
  }) => {
    await visitDatabase(page, WRITABLE_DB_ID);

    // cy.log("Model actions should be enabled for this db")
    await expect(page.getByLabel("Model actions", { exact: true })).toBeChecked();

    const action = await createModelWithAction(mb.api);

    await updateMainConnection(page, READ_ONLY_USER);
    expect(await runAction(mb.api, action.id)).toBeGreaterThanOrEqual(400);

    await createWritableConnection(page, DEFAULT_USER);
    expect(await runAction(mb.api, action.id)).toBeLessThan(400);
  });

  test("should be able to use model persistence with a writable connection", async ({
    page,
    mb,
  }) => {
    await enableGlobalModelPersistence(page);

    await visitDatabase(page, WRITABLE_DB_ID);
    await enableModelPersistence(page);

    const model = await createModel(mb.api);
    await enablePersistenceForModel(mb.api, model.id);

    await updateMainConnection(page, READ_ONLY_USER);
    await refreshModelPersistenceAndAwaitStatus(mb.api, model.id, "error");

    await createWritableConnection(page, DEFAULT_USER);
    await refreshModelPersistenceAndAwaitStatus(mb.api, model.id, "persisted");

    // Regression for metabase#74449: the Persist model data toggle must
    // reflect the mutation result without a page reload (persistModel returns
    // HTTP 204, and the UI relies on RTK cache invalidation to refetch the
    // persisted state).
    await page.goto(`/model/${model.id}`);
    await openQuestionActions(page, "Edit settings");

    const toggle = page.getByLabel("Persist model data", { exact: true });
    await expect(toggle).toBeChecked();
    await toggle.click({ force: true });
    await expect(toggle).not.toBeChecked();
    await toggle.click({ force: true });
    await expect(toggle).toBeChecked();
  });

  test("should be able to use table editing with a writable connection", async ({
    page,
    mb,
  }) => {
    await visitDatabase(page, WRITABLE_DB_ID);
    await enableTableEditing(page);

    await updateMainConnection(page, READ_ONLY_USER);
    const tableId = await getTableId(mb.api, {
      databaseId: WRITABLE_DB_ID,
      name: ORDERS_TABLE_NAME,
    });
    expect(await performTableEdit(mb.api, tableId)).toBeGreaterThanOrEqual(400);

    await createWritableConnection(page, DEFAULT_USER);
    expect(await performTableEdit(mb.api, tableId)).toBeLessThan(400);
  });

  test("should be possible to use uploads with a writable connection", async ({
    page,
    mb,
  }) => {
    await enableUploads(mb.api, "mysql");
    await visitDatabase(page, WRITABLE_DB_ID);

    await updateMainConnection(page, READ_ONLY_USER);
    expect(
      await performUpload(page, VALID_CSV_FILES[0], FIRST_COLLECTION_ID),
    ).toBeGreaterThanOrEqual(400);

    await createWritableConnection(page, DEFAULT_USER);
    expect(
      await performUpload(page, VALID_CSV_FILES[0], FIRST_COLLECTION_ID),
    ).toBeLessThan(400);
  });
});

// === helpers transcribed from the spec's own bottom-of-file functions ===

function visitDatabase(page: Page, databaseId: number) {
  return page.goto(`/admin/databases/${databaseId}`);
}

function createTestTransform(
  api: MetabaseApi,
  { tagIds = [] }: { tagIds?: number[] } = {},
) {
  return createTransform(api, {
    name: "Test transform",
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: {
          query: `SELECT * FROM ${ORDERS_TABLE_NAME} LIMIT 5`,
        },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: TRANSFORM_TABLE_NAME,
      schema: null,
    },
    tag_ids: tagIds,
  });
}

async function createUser(credentials: DatabaseCredentials) {
  await queryDB(
    `CREATE USER IF NOT EXISTS ${credentials.username} IDENTIFIED BY '${credentials.password}';
     GRANT SELECT ON ${DATABASE_NAME}.* TO '${credentials.username}';  `,
  );
}

async function dropUser(credentials: DatabaseCredentials) {
  await queryDB(`DROP USER IF EXISTS '${credentials.username}';`);
}

async function dropTable(tableName: string) {
  await queryDB(`DROP TABLE IF EXISTS ${tableName};`);
}

async function setupTableData(api: MetabaseApi) {
  await queryDB(`
    CREATE TABLE IF NOT EXISTS ${ORDERS_TABLE_NAME} (id INT, name VARCHAR(255));
    INSERT INTO ${ORDERS_TABLE_NAME} VALUES (1, 'Row 1'), (2, 'Row 2'), (3, 'Row 3');
  `);
  // `tables` is a deliberate strengthening over upstream's bare call — see the
  // header. Without it a stale `initial_sync_status: "complete"` row satisfies
  // the wait before the just-created table is visible.
  await resyncDatabase(api, {
    dbId: WRITABLE_DB_ID,
    tables: [ORDERS_TABLE_NAME],
  });
}

function createModel(api: MetabaseApi) {
  return createTestNativeQuery(api, {
    database: WRITABLE_DB_ID,
    query: `SELECT * FROM ${ORDERS_TABLE_NAME}`,
  }).then((dataset_query) =>
    createCard(api, {
      name: "Test model",
      type: "model",
      dataset_query,
    }),
  );
}

async function createModelWithAction(api: MetabaseApi) {
  const model = await createModel(api);
  return createAction(api, {
    type: "query",
    name: "Delete row",
    database_id: WRITABLE_DB_ID,
    model_id: model.id,
    parameters: [],
    dataset_query: {
      database: WRITABLE_DB_ID,
      type: "native",
      native: {
        query: `DELETE FROM ${ORDERS_TABLE_NAME} WHERE id = 1`,
      },
    },
  });
}

/**
 * `cy.findByLabelText("Editable tables").scrollIntoView().click({force:true})`
 *
 * Anchored on the resulting checked state. These admin switches fire an async
 * mutation and the page re-renders off the refetched database; Cypress's
 * command queue paced the next step past it, Playwright does not. See the
 * `enableModelPersistence` note — the same race MEASURABLY broke the
 * model-persistence test.
 */
async function enableTableEditing(page: Page) {
  const toggle = page.getByLabel("Editable tables", { exact: true });
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeEnabled();
  await toggle.click({ force: true });
  await expect(toggle).toBeChecked();
}

/**
 * `cy.visit("/admin/performance/models")` + `findByLabelText("Disabled").click({force:true})`
 *
 * TRAP: this is ONE Mantine Switch whose accessible name IS its state —
 * `label={modelPersistenceEnabled ? t`Enabled` : t`Disabled`}`
 * (ModelPersistenceConfiguration.tsx:155). So "Disabled" names the switch only
 * while it is off; the instant the click lands the locator matches nothing.
 * The post-click gate therefore has to be on the NEW name, not a re-resolve of
 * the old one — the same shape as the placeholder trap, with the accessible
 * name playing the part of the value attribute.
 *
 * The `toBeEnabled` gate before the click is also required: the switch is
 * wrapped in `DelayedLoadingAndErrorWrapper` until the setting has loaded, and
 * a force-click on a not-yet-live switch is a silent no-op.
 */
async function enableGlobalModelPersistence(page: Page) {
  await page.goto("/admin/performance/models");
  const off = page.getByLabel("Disabled", { exact: true });
  await expect(off).toBeEnabled();
  await off.click({ force: true });
  await expect(page.getByLabel("Enabled", { exact: true })).toBeChecked();
}

/**
 * `cy.findByLabelText("Model persistence").click({force:true})`
 *
 * MEASURED port drift, not defensive padding. `ModelCachingControl`'s
 * `onChange` awaits `persistDatabase(databaseId)` and the switch is
 * `checked={hasFeature(database, "persist-models-enabled")}`, i.e. it only
 * reflects the change once the refetched database lands. Without this gate the
 * very next call (`POST /api/persist/card/:id/persist`) raced ahead and the
 * backend answered `400 "Persisting models not enabled for database"`. Gating
 * on the state the race corrupts — the checked switch — fixes it; a sleep
 * would not be acceptable and is not used.
 */
async function enableModelPersistence(page: Page) {
  const toggle = page.getByLabel("Model persistence", { exact: true });
  await expect(toggle).toBeEnabled();
  await toggle.click({ force: true });
  await expect(toggle).toBeChecked();
}
