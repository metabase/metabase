import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

describe("scenarios > embedding > dashboard parameters", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    cy.intercept("GET", "/api/database").as("getDatabases");
    cy.intercept("GET", "/api/table/*").as("getTable");
  });

  it("should not allow to open table data view by default", () => {
    openDatabaseTable("People");

    cy.findByTestId("query-builder-root").should("be.visible");
  });

  describe("db setting is enabled", () => {
    beforeEach(() => {
      H.setTableEditingEnabledForDB(SAMPLE_DB_ID);
    });

    it("should allow to open table data view", () => {
      openDatabaseTable("People");

      cy.wait("@getTable");

      cy.findByTestId("table-data-view-root")
        .findByText("Editing People")
        .should("be.visible");
      cy.findByTestId("main-navbar-root").should("not.be.visible");

      cy.findByTestId("table-data-view-root")
        .findByLabelText("Back to Sample Database")
        .click();

      cy.findByTestId("browse-schemas").should("be.visible");
    });
  });
});

function openDatabaseTable(tableName: string) {
  cy.visit("/browse/databases");

  cy.wait("@getDatabases");

  cy.findByTestId("database-browser").findByText("Sample Database").click();
  cy.findByTestId("browse-schemas").findByText(tableName).click();
}
