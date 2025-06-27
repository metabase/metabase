import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > data-editing", () => {
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
        cy.findByText("People").should("be.visible");
        cy.findByTestId("head-crumbs-container")
          .findByText("Edit")
          .should("be.visible");

        cy.findByTestId("table-root").should("be.visible");
      });

    cy.findByTestId("head-crumbs-container").findByText("People").click();

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

  describe("table edit mode", () => {
    beforeEach(() => {
      cy.intercept("GET", `/api/table/${ORDERS_ID}/query_metadata`).as(
        "getOrdersTable",
      );

      cy.visit(`/browse/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/edit`);

      cy.wait("@getOrdersTable");
    });

    it("should allow to sort", () => {
      cy.findByTestId("table-header").within(() => {
        cy.findByText("Quantity").click();

        cy.findAllByTestId("header-sort-indicator").should("have.length", 1);

        cy.findByText("Quantity")
          .closest("[role=button]")
          .findByLabelText("chevronup icon")
          .should("be.visible");

        cy.findByText("Quantity").click();

        cy.findByText("Quantity")
          .closest("[role=button]")
          .findByLabelText("chevrondown icon")
          .should("be.visible");

        cy.findByText("Quantity").click();

        cy.findAllByTestId("header-sort-indicator").should("have.length", 0);
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
