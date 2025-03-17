import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

describe("scenarios > embedding > dashboard parameters", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    H.setTableEditingEnabledForDB(SAMPLE_DB_ID);

    cy.intercept("GET", "/api/database").as("getDatabases");
    cy.intercept("GET", "/api/table/*").as("getTable");
  });

  it("should allow to open table data page", () => {
    openDatabaseTable("People");

    cy.wait("@getTable");

    cy.findByTestId("main-navbar-root").should("not.be.visible");

    cy.findByTestId("table-data-view-root")
      .should("be.visible")
      .within(() => {
        cy.findByText("People").should("be.visible");

        cy.findByText("Explore").should("be.visible");
        cy.findByText("Edit").should("be.visible");
        cy.findByLabelText("Refresh").should("be.visible");

        cy.findByTestId("table-root").should("be.visible");
      });
  });

  it("should allow to open table data edit mode", () => {
    openDatabaseTable("People");

    cy.wait("@getTable");

    cy.findByTestId("table-data-view-root").findByText("Edit").click();

    cy.findByTestId("edit-table-data-root")
      .should("be.visible")
      .within(() => {
        cy.findByText("Editing People").should("be.visible");

        cy.findByTestId("table-root").should("be.visible");
      });

    cy.findByTestId("edit-table-data-root")
      .findByLabelText("Back to People")
      .click();

    cy.findByTestId("table-data-view-root").should("be.visible");
  });

  it("should allow to open table data explore mode - query builder", () => {
    openDatabaseTable("People");

    cy.wait("@getTable");

    cy.findByTestId("table-data-view-root").findByText("Explore").click();

    cy.findByTestId("query-builder-root")
      .should("be.visible")
      .within(() => {
        cy.findByText("Sample Database");
        cy.findByText("People");
      });
  });

  describe("db setting is disabled", () => {
    it("should not allow to open table data view by default", () => {
      H.setTableEditingEnabledForDB(SAMPLE_DB_ID, false);

      openDatabaseTable("People");

      cy.findByTestId("query-builder-root")
        .should("be.visible")
        .within(() => {
          cy.findByText("Sample Database");
          cy.findByText("People");
        });
    });
  });
});

function openDatabaseTable(tableName: string) {
  cy.visit("/browse/databases");

  cy.wait("@getDatabases");

  cy.findByTestId("database-browser").findByText("Sample Database").click();
  cy.findByTestId("browse-schemas").findByText(tableName).click();
}
