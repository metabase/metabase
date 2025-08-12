import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const DB_NAME = "Writable Postgres12";
const SOURCE_TABLE = "Animals";
const TARGET_TABLE = "transform_table";
const TARGET_TABLE_2 = "transform_table_2";
const TARGET_SCHEMA = "Schema A";
const TARGET_SCHEMA_2 = "Schema B";

describe("scenarios > admin > transforms", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });

    cy.intercept("POST", "/api/ee/transform").as("createTransform");
    cy.intercept("PUT", "/api/ee/transform/*").as("updateTransform");
    cy.intercept("DELETE", "/api/ee/transform/*").as("deleteTransform");
    cy.intercept("DELETE", "/api/ee/transform/*/table").as(
      "deleteTransformTable",
    );
  });

  describe("creation", () => {
    it("should be able to create and run an mbql transform", () => {
      cy.log("open the new transform page");
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("Query builder").click();

      cy.log("set the query");
      H.entityPickerModal().within(() => {
        cy.findByText(DB_NAME).click();
        cy.findByText(TARGET_SCHEMA).click();
        cy.findByText(SOURCE_TABLE).click();
      });
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("MBQL transform");
        cy.findByLabelText("Table name").type(TARGET_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      cy.log("run the transform and make sure its table can be queried");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader().findByText("Transform Table").should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to create and run a native transform", () => {
      cy.log("open the new transform page");
      visitTransformListPage();
      getTransformListPage().button("Create a transform").click();
      H.popover().findByText("SQL query").click();

      cy.log("set the query");
      H.popover().findByText(DB_NAME).click();
      H.NativeEditor.type(`SELECT * FROM "${TARGET_SCHEMA}"."${SOURCE_TABLE}"`);
      getQueryEditor().button("Save").click();
      H.modal().within(() => {
        cy.findByLabelText("Name").type("Native transform");
        cy.findByLabelText("Table name").type(TARGET_TABLE);
        cy.button("Save").click();
        cy.wait("@createTransform");
      });

      cy.log("run the transform and make sure its table can be queried");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader().findByText(DB_NAME).should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to create and run a transform from an mbql question", () => {
      cy.log("TBD");
    });

    it("should be able to create and run a transform from a native model", () => {
      cy.log("TBD");
    });
  });

  describe("runs", () => {
    it("should be able to navigate to a list of runs", () => {
      cy.log("TBD");
    });

    it("should display the error message from a failed run", () => {
      cy.log("TBD");
    });
  });

  describe("tags", () => {
    it("should be able to set tags", () => {
      cy.log("TBD");
    });

    it("should be able to create tags inline", () => {
      cy.log("TBD");
    });

    it("should be able to update tags inline", () => {
      cy.log("TBD");
    });

    it("should be able to delete tags inline", () => {
      cy.log("TBD");
    });
  });

  describe("targets", () => {
    it("should be able to change the target before running a transform", () => {
      cy.log("create but do not run the transform");
      createMbqlTransform({ visitTransform: true });

      cy.log("modify the transform before running");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("Table name").should("have.value", TARGET_TABLE);
        cy.findByLabelText("Schema").should("have.value", TARGET_SCHEMA);
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE_2);
        cy.findByLabelText("Schema").click();
      });
      H.popover().findByText(TARGET_SCHEMA_2).click();
      H.modal().within(() => {
        cy.button("Change target").click();
        cy.wait("@updateTransform");
      });
      getTableLink().should("have.text", TARGET_TABLE);
      getSchemaLink().should("have.text", TARGET_SCHEMA_2);

      cy.log("run the transform and verify the table");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader()
        .findByText("Transform Table 2")
        .should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to change the target after running a transform and keep the old target", () => {
      cy.log("create and run a transform");
      createMbqlTransform({ visitTransform: true });
      runAndWaitForSuccess();

      cy.log("modify the transform after running");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("Table name").should("have.value", TARGET_TABLE);
        cy.findByLabelText("Schema").should("have.value", TARGET_SCHEMA);
        cy.findByLabelText("Keep transform_table").should("be.checked");
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE);
        cy.button("Change target").click();
        cy.wait("@updateTransform");
      });
      getTableLink().should("have.text", TARGET_TABLE_2);

      cy.log("run the transform and verify the new table");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader()
        .findByText("Transform Table 2")
        .should("be.visible");
      H.assertQueryBuilderRowCount(3);

      cy.log("verify that the original question still works");
      visitTableQuestion();
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to change the target after running a transform and delete the old target", () => {
      cy.log("create and run a transform");
      createMbqlTransform({ visitTransform: true });
      runAndWaitForSuccess();

      cy.log("modify the transform after running");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("Table name").should("have.value", TARGET_TABLE);
        cy.findByLabelText("Schema").should("have.value", TARGET_SCHEMA);
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE_2);
        cy.findByLabelText("Delete transform_table").click();
        cy.button("Change target and delete the old one").click();
        cy.wait("@deleteTransformTable");
        cy.wait("@updateTransform");
      });
      getTableLink().should("have.text", TARGET_TABLE_2);

      cy.log("run the transform and verify the new table");
      runAndWaitForSuccess();
      getTableLink().click();
      H.queryBuilderHeader()
        .findByText("Transform Table 2")
        .should("be.visible");
      H.assertQueryBuilderRowCount(3);

      cy.log("verify that the original question still works");
      visitTableQuestion();
      assertTableDoesNotExistError();
    });

    it("should be able to delete the target and restore the same target back", () => {
      cy.log("create and run a transform");
      createMbqlTransform({ visitTransform: true });
      runAndWaitForSuccess();

      cy.log("delete the old target without creating the new one");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE_2);
        cy.findByLabelText("Delete transform_table").click();
        cy.button("Change target and delete the old one").click();
        cy.wait("@deleteTransformTable");
        cy.wait("@updateTransform");
      });

      cy.log("change the target back to the original one");
      getTransformPage().button("Change target").click();
      H.modal().within(() => {
        cy.findByLabelText("Table name").clear().type(TARGET_TABLE);
        cy.button("Change target").click();
        cy.wait("@updateTransform");
      });

      cy.log("run the transform to re-create the original target");
      runAndWaitForSuccess();

      cy.log("verify the target is available");
      getTableLink().click();
      H.queryBuilderHeader().findByText("Transform Table").should("be.visible");
      H.assertQueryBuilderRowCount(3);
    });
  });

  describe("metadata", () => {
    it("should be able to edit table metadata after table creation", () => {
      cy.log("TBD");
    });

    it("should be able to see all tables within the schema", () => {
      cy.log("TBD");
    });

    it("should be able to see all schemas within the database", () => {
      cy.log("TBD");
    });
  });

  describe("deletion", () => {
    it("should be able to delete a transform before creating the table", () => {
      cy.log("create a transform without running");
      createMbqlTransform({ visitTransform: true });

      cy.log("delete the transform");
      getTransformPage().button("Delete").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform only").should("not.exist");
        cy.findByLabelText("Delete the transform and the table").should(
          "not.exist",
        );
        cy.button("Delete transform").click();
        cy.wait("@deleteTransform");
      });
      getTransformListPage().should("be.visible");
    });

    it("should be able to delete a transform and keep the table", () => {
      cy.log("create a transform and the table");
      createMbqlTransform({ visitTransform: true });
      runAndWaitForSuccess();

      cy.log("delete the transform but keep the table");
      getTransformPage().button("Delete").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform only").should("be.checked");
        cy.button("Delete transform only").click();
        cy.wait("@deleteTransform");
      });
      getTransformListPage().should("be.visible");

      cy.log("make sure the table still exists");
      visitTableQuestion();
      H.assertQueryBuilderRowCount(3);
    });

    it("should be able to delete a transform and delete the table", () => {
      cy.log("create a transform and the table");
      createMbqlTransform({ visitTransform: true });
      runAndWaitForSuccess();

      cy.log("delete the transform and the table");
      getTransformPage().button("Delete").click();
      H.modal().within(() => {
        cy.findByLabelText("Delete the transform and the table").click();
        cy.button("Delete transform and table").click();
        cy.wait("@deleteTransformTable");
        cy.wait("@deleteTransform");
      });
      getTransformListPage().should("be.visible");

      cy.log("make sure the table is deleted");
      visitTableQuestion();
      assertTableDoesNotExistError();
    });
  });
});

function getTransformListPage() {
  return cy.findByTestId("transform-list-page");
}

function getTransformPage() {
  return cy.findByTestId("transform-page");
}

function getQueryEditor() {
  return cy.findByTestId("transform-query-editor");
}

function getRunButton() {
  return cy.findByTestId("run-button");
}

function getTableLink() {
  return cy.findByTestId("table-link");
}

function getSchemaLink() {
  return cy.findByTestId("schema-link");
}

function getQueryVisualization() {
  return cy.findByTestId("query-visualization-root");
}

function visitTransformListPage() {
  return cy.visit("/admin/transforms");
}

function runAndWaitForSuccess() {
  getRunButton().click();
  getRunButton().should("have.text", "Ran successfully");
}

type CreateTransformOpts = {
  sourceTable?: string;
  targetTable?: string;
  targetSchema?: string;
  visitTransform?: boolean;
};

function createMbqlTransform({
  sourceTable = SOURCE_TABLE,
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
  visitTransform,
}: CreateTransformOpts = {}) {
  H.getTableId({ name: sourceTable }).then((tableId) => {
    H.createTransform(
      {
        name: "MBQL transform",
        source: {
          type: "query",
          query: {
            database: WRITABLE_DB_ID,
            type: "query",
            query: {
              "source-table": tableId,
            },
          },
        },
        target: {
          type: "table",
          name: targetTable,
          schema: targetSchema,
        },
      },
      { wrapId: true, visitTransform },
    );
  });
}

function visitTableQuestion({
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
}: { targetTable?: string; targetSchema?: string } = {}) {
  H.visitQuestionAdhoc({
    dataset_query: {
      database: WRITABLE_DB_ID,
      type: "native",
      native: {
        query: `SELECT * FROM "${targetSchema}"."${targetTable}"`,
      },
    },
  });
}

function assertTableDoesNotExistError({
  targetTable = TARGET_TABLE,
  targetSchema = TARGET_SCHEMA,
}: { targetTable?: string; targetSchema?: string } = {}) {
  getQueryVisualization()
    .contains(`"${targetSchema}.${targetTable}" does not exist`)
    .should("be.visible");
}
