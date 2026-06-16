import {
  QA_DB_CREDENTIALS,
  QA_MYSQL_PORT,
  QA_POSTGRES_PORT,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import type { AdvancedConfig } from "metabase-types/api";

const { H } = cy;

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

describe("scenarios > workspaces > workspace instance", () => {
  describe("postgres", () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resetTestTable({ type: "postgres", table: "multi_schema" });
      H.queryWritableDB(
        `CREATE SCHEMA IF NOT EXISTS ${POSTGRES_OUTPUT_SCHEMA}`,
        "postgres",
      );
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });
    });

    afterEach(() => {
      H.clearWorkspaceInstanceConfig();
      H.queryWritableDB(
        `DROP SCHEMA IF EXISTS ${POSTGRES_OUTPUT_SCHEMA} CASCADE`,
        "postgres",
      );
    });

    it("runs a transform, surfaces the remapping on the instance page, and queries the remapped table", () => {
      cy.log("set up the workspace");
      H.WorkspaceListPage.visit();
      H.WorkspaceListPage.setupInstanceButton().click();
      H.SetupWorkspaceModal.uploadConfig(POSTGRES_CONFIG);
      H.SetupWorkspaceModal.setupButton().click();
      H.CurrentWorkspacePage.get().should("be.visible");

      cy.log("create and run a transform via the API");
      createAndRunTransform({
        sourceTable: POSTGRES_SOURCE_TABLE,
        sourceSchema: POSTGRES_INPUT_SCHEMA,
        targetTable: POSTGRES_TARGET_TABLE,
        targetSchema: POSTGRES_INPUT_SCHEMA,
      });

      cy.log("instance page shows the remapping for the transform target");
      H.CurrentWorkspacePage.visit();
      H.CurrentWorkspacePage.database(POSTGRES_DB_NAME)
        .should(
          "contain.text",
          `${POSTGRES_INPUT_SCHEMA}/${POSTGRES_TARGET_TABLE}`,
        )
        .and(
          "contain.text",
          `${POSTGRES_OUTPUT_SCHEMA}/${POSTGRES_INPUT_SCHEMA}__${POSTGRES_TARGET_TABLE}`,
        );

      cy.log("native query is rewritten to workspace table");
      H.startNewNativeQuestion({
        database: WRITABLE_DB_ID,
        query: `SELECT * FROM "${POSTGRES_INPUT_SCHEMA}"."${POSTGRES_TARGET_TABLE}"`,
      });
      H.runNativeQuery();
      H.assertQueryBuilderRowCount(ROW_COUNT);

      cy.log("mbql query is rewritten to workspace table");
      H.startNewQuestion();
      H.miniPicker().findByText(POSTGRES_DB_NAME).click();
      H.miniPicker().findByText(POSTGRES_INPUT_SCHEMA).click();
      H.miniPicker().findByText(POSTGRES_TARGET_TABLE_DISPLAY_NAME).click();
      H.visualize();
      H.assertQueryBuilderRowCount(ROW_COUNT);

      cy.log("the actual warehouse table lives under the workspace schema");
      H.queryWritableDB(
        `SELECT COUNT(*) AS count FROM "${POSTGRES_OUTPUT_SCHEMA}"."${POSTGRES_INPUT_SCHEMA}__${POSTGRES_TARGET_TABLE}"`,
        "postgres",
      ).then((result) => {
        expect(Number(result.rows[0].count)).to.eq(ROW_COUNT);
      });

      cy.log("leave the workspace through the UI");
      H.CurrentWorkspacePage.visit();
      H.CurrentWorkspacePage.leaveButton().click();
      H.LeaveWorkspaceModal.confirmButton().click();
      H.WorkspaceListPage.setupInstanceButton().should("be.visible");
    });
  });

  describe("mysql", () => {
    beforeEach(() => {
      H.restore("mysql-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resetTestTable({ type: "mysql", table: MYSQL_SOURCE_TABLE });
      H.queryWritableDB(
        `DROP DATABASE IF EXISTS ${MYSQL_OUTPUT_DATABASE}`,
        "mysql",
      );
      H.queryWritableDB(`CREATE DATABASE ${MYSQL_OUTPUT_DATABASE}`, "mysql");
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });
    });

    afterEach(() => {
      H.clearWorkspaceInstanceConfig();
      H.queryWritableDB(
        `DROP DATABASE IF EXISTS ${MYSQL_OUTPUT_DATABASE}`,
        "mysql",
      );
    });

    it("runs a transform, surfaces the remapping on the instance page, and queries the remapped table", () => {
      cy.log("set up the workspace");
      H.WorkspaceListPage.visit();
      H.WorkspaceListPage.setupInstanceButton().click();
      H.SetupWorkspaceModal.uploadConfig(MYSQL_CONFIG);
      H.SetupWorkspaceModal.setupButton().click();
      H.CurrentWorkspacePage.get().should("be.visible");

      cy.log("create and run a transform via the API");
      createAndRunTransform({
        sourceTable: MYSQL_SOURCE_TABLE,
        sourceSchema: null,
        targetTable: MYSQL_TARGET_TABLE,
        targetSchema: null,
      });

      cy.log("instance page shows the remapping for the transform target");
      H.CurrentWorkspacePage.visit();
      H.CurrentWorkspacePage.database(MYSQL_DB_NAME)
        .should("contain.text", MYSQL_TARGET_TABLE)
        .and(
          "contain.text",
          `${MYSQL_OUTPUT_DATABASE}/__${MYSQL_TARGET_TABLE}`,
        );

      cy.log("native query is rewritten to workspace table");
      H.startNewNativeQuestion({
        database: WRITABLE_DB_ID,
        query: `SELECT * FROM \`${MYSQL_TARGET_TABLE}\``,
      });
      H.runNativeQuery();
      H.assertQueryBuilderRowCount(ROW_COUNT);

      cy.log("mbql query is rewritten to workspace table");
      H.startNewQuestion();
      H.miniPicker().findByText(MYSQL_DB_NAME).click();
      H.miniPicker().findByText(MYSQL_TARGET_TABLE_DISPLAY_NAME).click();
      H.visualize();
      H.assertQueryBuilderRowCount(ROW_COUNT);

      cy.log("the actual warehouse table lives under the workspace database");
      H.queryWritableDB(
        `SELECT COUNT(*) AS count FROM \`${MYSQL_OUTPUT_DATABASE}\`.\`__${MYSQL_TARGET_TABLE}\``,
        "mysql",
      ).then((result) => {
        expect(Number(result.rows[0].count)).to.eq(ROW_COUNT);
      });

      cy.log("leave the workspace through the UI");
      H.CurrentWorkspacePage.visit();
      H.CurrentWorkspacePage.leaveButton().click();
      H.LeaveWorkspaceModal.confirmButton().click();
      H.WorkspaceListPage.setupInstanceButton().should("be.visible");
    });
  });
});

function createAndRunTransform({
  sourceTable,
  sourceSchema,
  targetTable,
  targetSchema,
}: {
  sourceTable: string;
  sourceSchema: string | null;
  targetTable: string;
  targetSchema: string | null;
}) {
  cy.log("create and run a transform via the API");
  H.getTableId({
    databaseId: WRITABLE_DB_ID,
    name: sourceTable,
    schema: sourceSchema ?? undefined,
  }).then((sourceTableId) => {
    H.createTestQuery({
      database: WRITABLE_DB_ID,
      stages: [
        {
          source: { type: "table", id: sourceTableId },
          limit: ROW_COUNT,
        },
      ],
    }).then((query) => {
      H.createTransform({
        name: "Workspace transform",
        source: { type: "query", query },
        target: {
          type: "table",
          database: WRITABLE_DB_ID,
          name: targetTable,
          schema: targetSchema,
        },
      }).then(({ body: transform }) => {
        H.runTransformAndWaitForSuccess(transform.id);
      });
    });
  });
}
