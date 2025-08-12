import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import type { TransformId } from "metabase-types/api";

const { H } = cy;

const DB_NAME = "Writable Postgres12";

describe("scenarios > admin > transforms", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID });
  });

  it("should be able to create and run an mbql transform", () => {
    visitTransformListPage();
    getTransformListPage().button("Create a transform").click();
    H.popover().findByText("Query builder").click();

    H.entityPickerModal().within(() => {
      cy.findByText(DB_NAME).click();
      cy.findByText("Schema a").click();
      cy.findByText("Animals").click();
    });
    getQueryEditor().button("Save").click();
    H.modal().within(() => {
      cy.findByLabelText("Name").type("MBQL transform");
      cy.findByLabelText("Table name").type("transform_table");
      cy.button("Save").click();
    });

    cy.log("run the transform and make sure its table can be queried");
    runAndWaitForSuccess();
    getTableLink().click();
    H.queryBuilderHeader().findByText("Transform Table").should("be.visible");
    H.assertQueryBuilderRowCount(3);
  });

  it("should be able to change the target before running a transform", () => {
    cy.log("create but do not run the transform");
    createMbqlTransform();
    cy.get<TransformId>("@transformId").then(visitTransformPage);

    cy.log("modify the transform before running");
    getTransformPage().button("Change target").click();
    H.modal().within(() => {
      cy.findByLabelText("Table name").should("have.value", "transform_table");
      cy.findByLabelText("Schema").should("have.value", "Schema A");
      cy.findByLabelText("Table name").clear().type("transform_table_2");
      cy.findByLabelText("Schema").click();
    });
    H.popover().findByText("Schema B").click();
    H.modal().button("Change target").click();
    getTableLink().should("have.text", "transform_table_2");
    getSchemaLink().should("have.text", "Schema B");

    cy.log("run the transform and verify the table");
    runAndWaitForSuccess();
    getTableLink().click();
    H.queryBuilderHeader().findByText("Transform Table 2").should("be.visible");
    H.assertQueryBuilderRowCount(3);
  });

  it("should be able to change the target after running a transform and keep the old target", () => {
    cy.log("create and run a transform");
    createMbqlTransform();
    cy.get<TransformId>("@transformId").then(visitTransformPage);
    runAndWaitForSuccess();

    cy.log("modify the transform after running");
    getTransformPage().button("Change target").click();
    H.modal().within(() => {
      cy.findByLabelText("Table name").should("have.value", "transform_table");
      cy.findByLabelText("Schema").should("have.value", "Schema A");
      cy.findByLabelText("Keep transform_table").should("be.checked");
      cy.findByLabelText("Table name").clear().type("transform_table_2");
      cy.button("Change target").click();
    });
    getTableLink().should("have.text", "transform_table_2");

    cy.log("run the transform and verify the new table");
    runAndWaitForSuccess();
    getTableLink().click();
    H.queryBuilderHeader().findByText("Transform Table 2").should("be.visible");
    H.assertQueryBuilderRowCount(3);

    cy.log("verify that the original question still works");
    H.createNativeQuestion(
      {
        database: WRITABLE_DB_ID,
        native: { query: 'SELECT * FROM "Schema A".transform_table' },
      },
      { visitQuestion: true },
    );
    H.assertQueryBuilderRowCount(3);
  });

  it("should be able to change the target after running a transform and delete the old target", () => {
    cy.log("create and run a transform");
    createMbqlTransform();
    cy.get<TransformId>("@transformId").then(visitTransformPage);
    runAndWaitForSuccess();

    cy.log("modify the transform after running");
    getTransformPage().button("Change target").click();
    H.modal().within(() => {
      cy.findByLabelText("Table name").should("have.value", "transform_table");
      cy.findByLabelText("Schema").should("have.value", "Schema A");
      cy.findByLabelText("Table name").clear().type("transform_table_2");
      cy.findByLabelText("Delete transform_table").click();
      cy.button("Change target and delete the old one").click();
    });
    getTableLink().should("have.text", "transform_table_2");

    cy.log("run the transform and verify the new table");
    runAndWaitForSuccess();
    getTableLink().click();
    H.queryBuilderHeader().findByText("Transform Table 2").should("be.visible");
    H.assertQueryBuilderRowCount(3);

    cy.log("verify that the original question still works");
    H.createNativeQuestion(
      {
        database: WRITABLE_DB_ID,
        native: { query: 'SELECT * FROM "Schema A".transform_table' },
      },
      { visitQuestion: true },
    );
    getQueryVisualization()
      .findByText(/ERROR: relation "Schema A.transform_table" does not exist/)
      .should("be.visible");
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

function visitTransformPage(id: TransformId) {
  return cy.visit(`/admin/transforms/${id}`);
}

function runAndWaitForSuccess() {
  getRunButton().click();
  getRunButton().should("have.text", "Ran successfully");
}

function createMbqlTransform() {
  H.getTableId({ name: "Animals" }).then((tableId) => {
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
          name: "transform_table",
          schema: "Schema A",
        },
      },
      { wrapId: true },
    );
  });
}
