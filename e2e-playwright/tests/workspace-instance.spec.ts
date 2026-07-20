/**
 * Playwright port of
 * e2e/test/scenarios/workspaces/workspace-instance.cy.spec.ts (287 lines).
 *
 * Two tests, one per warehouse engine (postgres, mysql). Both are ported in
 * upstream order with nothing dropped, weakened or merged.
 *
 * ============================== TOKEN GATE ==============================
 * Upstream's `H.activateToken("bleeding-edge")` is load-bearing on BOTH sides
 * of the stack, and this was measured rather than assumed (two-arm control,
 * findings-inbox/workspace-instance.md):
 *
 *   - Backend: `enterprise/.../api_routes/routes.clj:153` mounts
 *     `/workspace-instance` through `(premium-handler … :workspaces)`, i.e.
 *     `ee.api/+require-premium-feature :workspaces`. `:workspaces` is a plain
 *     `define-premium-feature` (premium_features/settings.clj:379) — no
 *     `(or (not is-hosted?) …)` short circuit, no per-argument split. HARD GATE.
 *     Measured on this slot's backend: without the feature
 *     `GET /api/ee/workspace-instance/current` → **402**; after activating
 *     bleeding-edge (`token-features.workspaces: true`) → **200**, and
 *     `DELETE` → **204**.
 *   - Frontend: `metabase-enterprise/workspaces/index.ts` only assigns
 *     `PLUGIN_WORKSPACES.getDataStudioRoutes` under
 *     `hasPremiumFeature("workspaces")`, so without the token
 *     /data-studio/workspaces does not render the pages at all.
 *
 * BE and FE therefore AGREE here (unlike the transforms-permissions case).
 *
 * ============================ QA-DATABASE GATE ============================
 * Upstream is `@external` on both arms: postgres restores `postgres-writable`
 * and drives the writable QA postgres (:5404); mysql restores
 * `mysql-writable` and drives the QA MySQL (:3304). Both are gated on
 * PW_QA_DB_ENABLED, and are meant to EXECUTE (FINDINGS #49). The container
 * gate and the token gate are independent: PW_QA_DB_ENABLED decides whether
 * the test runs at all, the token decides whether the feature works inside it.
 *
 * ================================ PORT NOTES ================================
 * - `H.restore(...)` + `H.activateToken(...)` + `H.resetTestTable(...)` +
 *   `H.queryWritableDB(...)` + `H.resyncDatabase(...)` map 1:1 onto the
 *   existing shared ports; nothing about the beforeEach is restructured.
 * - `should("contain.text", x)` is a CONCATENATION assertion on a single
 *   element, so it becomes `toContainText(x)` on the same region locator, one
 *   `expect` per upstream `.should`/`.and`. Playwright normalises whitespace
 *   in `toContainText` and Cypress does not — immaterial here because every
 *   needle (`Domestic/transform_table`, `mb__isolation/__transform_table`, …)
 *   contains no whitespace, and whitespace normalisation only collapses runs,
 *   it never deletes characters, so it can neither create a false positive nor
 *   a false negative for these needles.
 * - `H.SetupWorkspaceModal.uploadConfig` → `setInputFiles` with the same
 *   yaml.dump'd buffer (see support/workspace-instance.ts).
 * - The upstream `cy.log(...)` breadcrumbs are preserved as comments.
 * - The spec-local `createAndRunTransform` (upstream 258-287) lives in
 *   support/workspace-instance.ts, unchanged in behaviour; it is a pure API
 *   sequence with no Cypress-queue semantics to lose.
 *
 * SHARED-STATE NOTE: the afterEach hooks are ports of upstream's, and they
 * matter more here than in CI because the writable containers are long-lived
 * and shared between slots. `mb__isolation` is upstream's own literal, not a
 * fixture I invented, and it is dropped after each test; the `Domestic`/`Wild`
 * schemas that `resetTestTableMultiSchema` rebuilds are the same ones several
 * other ported specs rebuild.
 */
import { expect, test } from "../support/fixtures";
import { startNewNativeQuestion } from "../support/native-editor";
import { runNativeQuery } from "../support/models";
import {
  assertQueryBuilderRowCount,
  miniPicker,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import {
  type AdvancedConfig,
  CurrentWorkspacePage,
  LeaveWorkspaceModal,
  QA_DB_SKIP_REASON,
  SetupWorkspaceModal,
  WRITABLE_DB_ID,
  WorkspaceListPage,
  clearWorkspaceInstanceConfig,
  createAndRunTransform,
  queryWritableDB,
  resetTestTable,
  resetTestTableMultiSchema,
  resyncDatabase,
} from "../support/workspace-instance";

// Mirrors e2e/support/cypress_data.js (QA_DB_CREDENTIALS / QA_*_PORT).
const QA_DB_CREDENTIALS = {
  host: "localhost",
  user: "metabase",
  password: "metasample123",
};
const QA_MYSQL_PORT = 3304;
const QA_POSTGRES_PORT = 5404;

const WORKSPACE_NAME = "E2E workspace instance";
const ROW_COUNT = 3;

const POSTGRES_DB_NAME = "Writable Postgres12";
const POSTGRES_INPUT_SCHEMA = "Domestic";
const POSTGRES_OUTPUT_SCHEMA = "mb__isolation";
const POSTGRES_SOURCE_TABLE = "Animals";
const POSTGRES_TARGET_TABLE = "transform_table";
const POSTGRES_TARGET_TABLE_DISPLAY_NAME = "Transform Table";

const POSTGRES_CONFIG: AdvancedConfig = {
  version: 1,
  config: {
    databases: [
      {
        name: POSTGRES_DB_NAME,
        engine: "postgres",
        details: {
          host: QA_DB_CREDENTIALS.host,
          port: QA_POSTGRES_PORT,
          dbname: "writable_db",
          user: QA_DB_CREDENTIALS.user,
          password: QA_DB_CREDENTIALS.password,
          ssl: false,
        },
      },
    ],
    workspace: {
      name: WORKSPACE_NAME,
      databases: {
        [POSTGRES_DB_NAME]: {
          input_schemas: [POSTGRES_INPUT_SCHEMA],
          output: { schema: POSTGRES_OUTPUT_SCHEMA },
        },
      },
    },
  },
};

const MYSQL_DB_NAME = "Writable MySQL8";
const MYSQL_OUTPUT_DATABASE = "mb__isolation";
const MYSQL_SOURCE_TABLE = "scoreboard_actions";
const MYSQL_TARGET_TABLE = "transform_table";
const MYSQL_TARGET_TABLE_DISPLAY_NAME = "Transform Table";

const MYSQL_CONFIG: AdvancedConfig = {
  version: 1,
  config: {
    databases: [
      {
        name: MYSQL_DB_NAME,
        engine: "mysql",
        details: {
          host: QA_DB_CREDENTIALS.host,
          port: QA_MYSQL_PORT,
          dbname: "writable_db",
          user: "root",
          password: QA_DB_CREDENTIALS.password,
          ssl: false,
        },
      },
    ],
    workspace: {
      name: WORKSPACE_NAME,
      databases: {
        [MYSQL_DB_NAME]: {
          input_schemas: [],
          output: { db: MYSQL_OUTPUT_DATABASE },
        },
      },
    },
  },
};

test.describe("scenarios > workspaces > workspace instance", () => {
  test.skip(!process.env.PW_QA_DB_ENABLED, QA_DB_SKIP_REASON);

  test.describe("postgres", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore("postgres-writable");
      await mb.signInAsAdmin();
      await mb.api.activateToken("bleeding-edge");
      await resetTestTableMultiSchema();
      await queryWritableDB(
        `CREATE SCHEMA IF NOT EXISTS ${POSTGRES_OUTPUT_SCHEMA}`,
        "postgres",
      );
      await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });
    });

    test.afterEach(async ({ mb }) => {
      await clearWorkspaceInstanceConfig(mb.api);
      await queryWritableDB(
        `DROP SCHEMA IF EXISTS ${POSTGRES_OUTPUT_SCHEMA} CASCADE`,
        "postgres",
      );
    });

    test("runs a transform, surfaces the remapping on the instance page, and queries the remapped table", async ({
      page,
      mb,
    }) => {
      // set up the workspace
      await WorkspaceListPage.visit(page);
      await WorkspaceListPage.setupInstanceButton(page).click();
      await SetupWorkspaceModal.uploadConfig(page, POSTGRES_CONFIG);
      await SetupWorkspaceModal.setupButton(page).click();
      await expect(CurrentWorkspacePage.get(page)).toBeVisible();

      // create and run a transform via the API
      await createAndRunTransform(mb.api, {
        sourceTable: POSTGRES_SOURCE_TABLE,
        sourceSchema: POSTGRES_INPUT_SCHEMA,
        targetTable: POSTGRES_TARGET_TABLE,
        targetSchema: POSTGRES_INPUT_SCHEMA,
        rowCount: ROW_COUNT,
      });

      // instance page shows the remapping for the transform target
      await CurrentWorkspacePage.visit(page);
      await expect(
        CurrentWorkspacePage.database(page, POSTGRES_DB_NAME),
      ).toContainText(`${POSTGRES_INPUT_SCHEMA}/${POSTGRES_TARGET_TABLE}`);
      await expect(
        CurrentWorkspacePage.database(page, POSTGRES_DB_NAME),
      ).toContainText(
        `${POSTGRES_OUTPUT_SCHEMA}/${POSTGRES_INPUT_SCHEMA}__${POSTGRES_TARGET_TABLE}`,
      );

      // native query is rewritten to workspace table
      await startNewNativeQuestion(page, {
        database: WRITABLE_DB_ID,
        query: `SELECT * FROM "${POSTGRES_INPUT_SCHEMA}"."${POSTGRES_TARGET_TABLE}"`,
      });
      await runNativeQuery(page);
      await assertQueryBuilderRowCount(page, ROW_COUNT);

      // mbql query is rewritten to workspace table
      await startNewQuestion(page);
      await miniPicker(page).getByText(POSTGRES_DB_NAME).click();
      await miniPicker(page).getByText(POSTGRES_INPUT_SCHEMA).click();
      await miniPicker(page)
        .getByText(POSTGRES_TARGET_TABLE_DISPLAY_NAME)
        .click();
      await visualize(page);
      await assertQueryBuilderRowCount(page, ROW_COUNT);

      // the actual warehouse table lives under the workspace schema
      const result = await queryWritableDB(
        `SELECT COUNT(*) AS count FROM "${POSTGRES_OUTPUT_SCHEMA}"."${POSTGRES_INPUT_SCHEMA}__${POSTGRES_TARGET_TABLE}"`,
        "postgres",
      );
      expect(Number(result.rows[0].count)).toBe(ROW_COUNT);

      // leave the workspace through the UI
      await CurrentWorkspacePage.visit(page);
      await CurrentWorkspacePage.leaveButton(page).click();
      await LeaveWorkspaceModal.confirmButton(page).click();
      await expect(WorkspaceListPage.setupInstanceButton(page)).toBeVisible();
    });
  });

  test.describe("mysql", () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore("mysql-writable");
      await mb.signInAsAdmin();
      await mb.api.activateToken("bleeding-edge");
      await resetTestTable({ type: "mysql", table: MYSQL_SOURCE_TABLE });
      await queryWritableDB(
        `DROP DATABASE IF EXISTS ${MYSQL_OUTPUT_DATABASE}`,
        "mysql",
      );
      await queryWritableDB(`CREATE DATABASE ${MYSQL_OUTPUT_DATABASE}`, "mysql");
      await resyncDatabase(mb.api, { dbId: WRITABLE_DB_ID });
    });

    test.afterEach(async ({ mb }) => {
      await clearWorkspaceInstanceConfig(mb.api);
      await queryWritableDB(
        `DROP DATABASE IF EXISTS ${MYSQL_OUTPUT_DATABASE}`,
        "mysql",
      );
    });

    test("runs a transform, surfaces the remapping on the instance page, and queries the remapped table", async ({
      page,
      mb,
    }) => {
      // set up the workspace
      await WorkspaceListPage.visit(page);
      await WorkspaceListPage.setupInstanceButton(page).click();
      await SetupWorkspaceModal.uploadConfig(page, MYSQL_CONFIG);
      await SetupWorkspaceModal.setupButton(page).click();
      await expect(CurrentWorkspacePage.get(page)).toBeVisible();

      // create and run a transform via the API
      await createAndRunTransform(mb.api, {
        sourceTable: MYSQL_SOURCE_TABLE,
        sourceSchema: null,
        targetTable: MYSQL_TARGET_TABLE,
        targetSchema: null,
        rowCount: ROW_COUNT,
      });

      // instance page shows the remapping for the transform target
      await CurrentWorkspacePage.visit(page);
      await expect(
        CurrentWorkspacePage.database(page, MYSQL_DB_NAME),
      ).toContainText(MYSQL_TARGET_TABLE);
      await expect(
        CurrentWorkspacePage.database(page, MYSQL_DB_NAME),
      ).toContainText(`${MYSQL_OUTPUT_DATABASE}/__${MYSQL_TARGET_TABLE}`);

      // native query is rewritten to workspace table
      await startNewNativeQuestion(page, {
        database: WRITABLE_DB_ID,
        query: `SELECT * FROM \`${MYSQL_TARGET_TABLE}\``,
      });
      await runNativeQuery(page);
      await assertQueryBuilderRowCount(page, ROW_COUNT);

      // mbql query is rewritten to workspace table
      await startNewQuestion(page);
      await miniPicker(page).getByText(MYSQL_DB_NAME).click();
      await miniPicker(page).getByText(MYSQL_TARGET_TABLE_DISPLAY_NAME).click();
      await visualize(page);
      await assertQueryBuilderRowCount(page, ROW_COUNT);

      // the actual warehouse table lives under the workspace database
      const result = await queryWritableDB(
        `SELECT COUNT(*) AS count FROM \`${MYSQL_OUTPUT_DATABASE}\`.\`__${MYSQL_TARGET_TABLE}\``,
        "mysql",
      );
      expect(Number(result.rows[0].count)).toBe(ROW_COUNT);

      // leave the workspace through the UI
      await CurrentWorkspacePage.visit(page);
      await CurrentWorkspacePage.leaveButton(page).click();
      await LeaveWorkspaceModal.confirmButton(page).click();
      await expect(WorkspaceListPage.setupInstanceButton(page)).toBeVisible();
    });
  });
});
