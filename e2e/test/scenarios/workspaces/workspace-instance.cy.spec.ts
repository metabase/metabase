import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { TransformId } from "metabase-types/api";

const { H } = cy;

const WORKSPACE_NAME = "E2E workspace instance";
const WORKSPACE_NAMESPACE = "iso_e2e";
const TARGET_TABLE = "ws_e2e_target";

describe("scenarios > workspaces > workspace instance", () => {
  describe("postgres", () => {
    const DB_NAME = "Writable Postgres12";
    const INPUT_SCHEMA = "Domestic";
    const SOURCE_TABLE = "Animals";

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      // multi_schema seeds `Domestic` (with `Animals`, etc.) and `Wild`.
      H.resetTestTable({ type: "postgres", table: "multi_schema" });
      H.queryWritableDB(
        `DROP SCHEMA IF EXISTS ${WORKSPACE_NAMESPACE} CASCADE`,
        "postgres",
      );
      H.queryWritableDB(`CREATE SCHEMA ${WORKSPACE_NAMESPACE}`, "postgres");
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });
      H.setWorkspaceInstanceConfig({
        name: WORKSPACE_NAME,
        databases: {
          [WRITABLE_DB_ID]: {
            input_schemas: [INPUT_SCHEMA],
            output: { schema: WORKSPACE_NAMESPACE },
          },
        },
      });
    });

    afterEach(() => {
      H.clearWorkspaceInstanceConfig();
      H.queryWritableDB(
        `DROP SCHEMA IF EXISTS ${WORKSPACE_NAMESPACE} CASCADE`,
        "postgres",
      );
    });

    it("runs a transform, surfaces the remapping on the instance page, and queries the remapped table", () => {
      cy.log("instance page shows the configured database and an empty state");
      H.WorkspaceInstancePage.visit();
      H.WorkspaceInstancePage.get().should("contain.text", WORKSPACE_NAME);
      H.WorkspaceInstancePage.database(DB_NAME).should("be.visible");
      H.WorkspaceInstancePage.emptyState().should("be.visible");

      cy.log("create a transform via the API");
      H.getTableId({
        databaseId: WRITABLE_DB_ID,
        name: SOURCE_TABLE,
        schema: INPUT_SCHEMA,
      }).then((sourceTableId) => {
        H.createTransform(
          {
            name: "Workspace transform",
            source: {
              type: "query",
              query: {
                database: WRITABLE_DB_ID,
                type: "query",
                query: { "source-table": sourceTableId, limit: 5 },
              },
            },
            target: {
              type: "table",
              database: WRITABLE_DB_ID,
              name: TARGET_TABLE,
              schema: INPUT_SCHEMA,
            },
          },
          { wrapId: true, idAlias: "transformId" },
        );
      });

      cy.log("run the transform via the UI");
      cy.get<TransformId>("@transformId").then((transformId) => {
        H.DataStudio.Transforms.visitTransform(transformId);
      });
      H.DataStudio.Transforms.runTab().click();
      H.DataStudio.Transforms.runButton().click();
      H.DataStudio.Transforms.runButton().should(
        "have.text",
        "Ran successfully",
      );

      cy.log(
        "navigate to the instance page via the nav — verifies the RTK Query cache picks up the new remapping",
      );
      H.DataStudio.nav().findByRole("link", { name: "Workspace" }).click();
      H.WorkspaceInstancePage.get().should("be.visible");
      H.WorkspaceInstancePage.database(DB_NAME)
        .should("contain.text", `${INPUT_SCHEMA}/${TARGET_TABLE}`)
        .and(
          "contain.text",
          `${WORKSPACE_NAMESPACE}/${INPUT_SCHEMA}__${TARGET_TABLE}`,
        );

      cy.log("the canonical table is queryable in the query builder");
      cy.get<TransformId>("@transformId").then((transformId) => {
        H.DataStudio.Transforms.visitTransform(transformId);
      });
      H.DataStudio.Transforms.settingsTab().click();
      cy.findByRole("link", { name: new RegExp(TARGET_TABLE) }).click();
      H.assertQueryBuilderRowCount(5);

      cy.log("the actual warehouse table lives under the workspace schema");
      H.queryWritableDB(
        `SELECT COUNT(*) AS count FROM "${WORKSPACE_NAMESPACE}"."${INPUT_SCHEMA}__${TARGET_TABLE}"`,
        "postgres",
      ).then((result) => {
        expect(Number(result.rows[0].count)).to.eq(5);
      });
    });
  });

  describe("mysql", () => {
    const DB_NAME = "Writable MySQL8";
    // MySQL has no schema layer; the writable db's logical "schema" is just the
    // database name and the workspace's iso namespace is a separate MySQL db.
    const INPUT_SCHEMA = "writable_db";
    const SOURCE_TABLE = "ORDERS";

    beforeEach(() => {
      H.restore("mysql-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.queryWritableDB(
        `DROP DATABASE IF EXISTS ${WORKSPACE_NAMESPACE}`,
        "mysql",
      );
      H.queryWritableDB(`CREATE DATABASE ${WORKSPACE_NAMESPACE}`, "mysql");
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });
      H.setWorkspaceInstanceConfig({
        name: WORKSPACE_NAME,
        databases: {
          [WRITABLE_DB_ID]: {
            input_schemas: [INPUT_SCHEMA],
            // MySQL has no schema layer; the namespace lands in the `:db` slot.
            output: { db: WORKSPACE_NAMESPACE },
          },
        },
      });
    });

    afterEach(() => {
      H.clearWorkspaceInstanceConfig();
      H.queryWritableDB(
        `DROP DATABASE IF EXISTS ${WORKSPACE_NAMESPACE}`,
        "mysql",
      );
    });

    it("runs a transform, surfaces the remapping on the instance page, and queries the remapped table", () => {
      cy.log("instance page shows the configured database and an empty state");
      H.WorkspaceInstancePage.visit();
      H.WorkspaceInstancePage.get().should("contain.text", WORKSPACE_NAME);
      H.WorkspaceInstancePage.database(DB_NAME).should("be.visible");
      H.WorkspaceInstancePage.emptyState().should("be.visible");

      cy.log("create a transform via the API");
      H.getTableId({
        databaseId: WRITABLE_DB_ID,
        name: SOURCE_TABLE,
      }).then((sourceTableId) => {
        H.createTransform(
          {
            name: "Workspace transform",
            source: {
              type: "query",
              query: {
                database: WRITABLE_DB_ID,
                type: "query",
                query: { "source-table": sourceTableId, limit: 5 },
              },
            },
            target: {
              type: "table",
              database: WRITABLE_DB_ID,
              name: TARGET_TABLE,
              schema: null,
            },
          },
          { wrapId: true, idAlias: "transformId" },
        );
      });

      cy.log("run the transform via the UI");
      cy.get<TransformId>("@transformId").then((transformId) => {
        H.DataStudio.Transforms.visitTransform(transformId);
      });
      H.DataStudio.Transforms.runTab().click();
      H.DataStudio.Transforms.runButton().click();
      H.DataStudio.Transforms.runButton().should(
        "have.text",
        "Ran successfully",
      );

      cy.log(
        "navigate to the instance page via the nav — verifies the RTK Query cache picks up the new remapping",
      );
      H.DataStudio.nav().findByRole("link", { name: "Workspace" }).click();
      H.WorkspaceInstancePage.get().should("be.visible");
      // MySQL has no schema prefix on the "from" side — the row carries just
      // the table name; the iso side qualifies with the namespace db.
      H.WorkspaceInstancePage.database(DB_NAME)
        .should("contain.text", TARGET_TABLE)
        .and("contain.text", `${WORKSPACE_NAMESPACE}/__${TARGET_TABLE}`);

      cy.log("the canonical table is queryable in the query builder");
      cy.get<TransformId>("@transformId").then((transformId) => {
        H.DataStudio.Transforms.visitTransform(transformId);
      });
      H.DataStudio.Transforms.settingsTab().click();
      cy.findByRole("link", { name: new RegExp(TARGET_TABLE) }).click();
      H.assertQueryBuilderRowCount(5);

      cy.log("the actual warehouse table lives under the workspace database");
      H.queryWritableDB(
        `SELECT COUNT(*) AS count FROM \`${WORKSPACE_NAMESPACE}\`.\`__${TARGET_TABLE}\``,
        "mysql",
      ).then((result) => {
        expect(Number(result.rows[0].count)).to.eq(5);
      });
    });
  });
});
