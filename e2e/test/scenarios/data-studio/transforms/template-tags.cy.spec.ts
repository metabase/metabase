import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const DB_NAME = "Writable Postgres12";
const SOURCE_TABLE = "Animals";

describe("scenarios > admin > transforms", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("POST", "/api/transform").as("createTransform");
    cy.intercept("PUT", "/api/transform/*").as("updateTransform");
    cy.intercept("DELETE", "/api/transform/*").as("deleteTransform");
    cy.intercept("DELETE", "/api/transform/*/table").as("deleteTransformTable");
    cy.intercept("POST", "/api/transform-tag").as("createTag");
    cy.intercept("PUT", "/api/transform-tag/*").as("updateTag");
    cy.intercept("DELETE", "/api/transform-tag/*").as("deleteTag");
    cy.intercept("POST", "/api/ee/dependencies/check_transform").as(
      "checkTransformDependencies",
    );
  });

  it("should be able to use the data reference and snippets when writing a SQL transform", () => {
    H.createSnippet({
      name: "snippet1",
      content: "'foo'",
    });

    visitTransformListPage();
    cy.button("Create a transform").click();
    H.popover().findByText("SQL query").click();
    H.popover().findByText(DB_NAME).click();

    function testDataReference() {
      cy.log("open the data reference");
      cy.findByTestId("native-query-editor-action-buttons")
        .findByLabelText("Learn about your data")
        .click();

      editorSidebar()
        .should("be.visible")
        .within(() => {
          cy.log("The current database should be opened by default");
          cy.findByText("Data Reference").should("not.exist");
          cy.findByText("Writable Postgres12").should("be.visible");
        });

      cy.findByTestId("native-query-editor-action-buttons")
        .findByLabelText("Learn about your data")
        .click();

      editorSidebar().should("not.exist");
    }

    function testSnippets() {
      cy.findByTestId("native-query-editor-action-buttons")
        .findByLabelText("SQL Snippets")
        .click();

      editorSidebar()
        .should("be.visible")
        .within(() => {
          cy.findByText("snippet1").should("be.visible");
          cy.icon("snippet").click();
        });

      H.NativeEditor.value().should("eq", "{{snippet: snippet1}}");

      cy.findByTestId("native-query-editor-action-buttons")
        .findByLabelText("SQL Snippets")
        .click();

      editorSidebar().should("not.exist");

      cy.findByTestId("native-query-editor-action-buttons")
        .findByLabelText("Preview the query")
        .click();

      H.modal().findByText("'foo'").should("be.visible");
    }

    testDataReference();
    testSnippets();
  });
});

function visitTransformListPage() {
  return cy.visit("/data-studio/transforms");
}

function editorSidebar() {
  return cy.findByTestId("editor-sidebar");
}
