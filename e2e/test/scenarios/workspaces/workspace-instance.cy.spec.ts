import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const WORKSPACE_NAME = "E2E workspace instance";
const ROW_COUNT = 3;

describe("scenarios > workspaces > workspace instance", () => {
  describe("postgres", () => {
    const databaseName = "Writable Postgres12";
    const inputSchema = "Domestic";
    const outputSchema = "mb__isolation";
    const sourceTable = "Animals";
    const targetTable = "transform_table";
    const targetTableDisplayName = "Transform Table";

    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resetTestTable({ type: "postgres", table: "multi_schema" });
      H.queryWritableDB(
        `CREATE SCHEMA IF NOT EXISTS ${outputSchema}`,
        "postgres",
      );
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });
      H.setWorkspaceInstanceConfig({
        name: WORKSPACE_NAME,
        databases: {
          [WRITABLE_DB_ID]: {
            input_schemas: [inputSchema],
            output: { schema: outputSchema },
          },
        },
      });
    });

    afterEach(() => {
      H.clearWorkspaceInstanceConfig();
      H.queryWritableDB(
        `DROP SCHEMA IF EXISTS ${outputSchema} CASCADE`,
        "postgres",
      );
    });

    it("runs a transform, surfaces the remapping on the instance page, and queries the remapped table", () => {
      cy.log("create and run a transform via the API");
      createAndRunTransform({
        sourceTable,
        sourceSchema: inputSchema,
        targetTable,
        targetSchema: inputSchema,
      });

      cy.log("instance page shows the remapping for the transform target");
      H.WorkspaceInstancePage.visit();
      H.WorkspaceInstancePage.database(databaseName)
        .should("contain.text", `${inputSchema}/${targetTable}`)
        .and("contain.text", `${outputSchema}/${inputSchema}__${targetTable}`);

      cy.log("native query is rewritten to workspace table");
      H.startNewNativeQuestion({
        database: WRITABLE_DB_ID,
        query: `SELECT * FROM "${inputSchema}"."${targetTable}"`,
      });
      H.runNativeQuery();
      H.assertQueryBuilderRowCount(ROW_COUNT);

      cy.log("mbql query is rewritten to workspace table");
      H.startNewQuestion();
      H.miniPicker().findByText(databaseName).click();
      H.miniPicker().findByText(inputSchema).click();
      H.miniPicker().findByText(targetTableDisplayName).click();
      H.visualize();
      H.assertQueryBuilderRowCount(ROW_COUNT);

      cy.log("the actual warehouse table lives under the workspace schema");
      H.queryWritableDB(
        `SELECT COUNT(*) AS count FROM "${outputSchema}"."${inputSchema}__${targetTable}"`,
        "postgres",
      ).then((result) => {
        expect(Number(result.rows[0].count)).to.eq(ROW_COUNT);
      });
    });
  });

  describe("mysql", () => {
    const databaseName = "Writable MySQL8";
    const outputDatabase = "mb__isolation";
    const sourceTable = "scoreboard_actions";
    const targetTable = "transform_table";
    const targetTableDisplayName = "Transform Table";

    beforeEach(() => {
      H.restore("mysql-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resetTestTable({ type: "mysql", table: sourceTable });
      H.queryWritableDB(`DROP DATABASE IF EXISTS ${outputDatabase}`, "mysql");
      H.queryWritableDB(`CREATE DATABASE ${outputDatabase}`, "mysql");
      H.resyncDatabase({ dbId: WRITABLE_DB_ID });
      H.setWorkspaceInstanceConfig({
        name: WORKSPACE_NAME,
        databases: {
          [WRITABLE_DB_ID]: {
            input_schemas: [],
            output: { db: outputDatabase },
          },
        },
      });
    });

    afterEach(() => {
      H.clearWorkspaceInstanceConfig();
      H.queryWritableDB(`DROP DATABASE IF EXISTS ${outputDatabase}`, "mysql");
    });

    it("runs a transform, surfaces the remapping on the instance page, and queries the remapped table", () => {
      cy.log("create and run a transform via the API");
      createAndRunTransform({
        sourceTable,
        sourceSchema: null,
        targetTable,
        targetSchema: null,
      });

      cy.log("instance page shows the remapping for the transform target");
      H.WorkspaceInstancePage.visit();
      H.WorkspaceInstancePage.database(databaseName)
        .should("contain.text", targetTable)
        .and("contain.text", `${outputDatabase}/__${targetTable}`);

      cy.log("native query is rewritten to workspace table");
      H.startNewNativeQuestion({
        database: WRITABLE_DB_ID,
        query: `SELECT * FROM \`${targetTable}\``,
      });
      H.runNativeQuery();
      H.assertQueryBuilderRowCount(ROW_COUNT);

      cy.log("mbql query is rewritten to workspace table");
      H.startNewQuestion();
      H.miniPicker().findByText(databaseName).click();
      H.miniPicker().findByText(targetTableDisplayName).click();
      H.visualize();
      H.assertQueryBuilderRowCount(ROW_COUNT);

      cy.log("the actual warehouse table lives under the workspace database");
      H.queryWritableDB(
        `SELECT COUNT(*) AS count FROM \`${outputDatabase}\`.\`__${targetTable}\``,
        "mysql",
      ).then((result) => {
        expect(Number(result.rows[0].count)).to.eq(ROW_COUNT);
      });
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
