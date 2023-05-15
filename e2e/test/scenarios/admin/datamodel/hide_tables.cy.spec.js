import { restore, startNewQuestion } from "e2e/support/helpers";

import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > hidden tables (metabase#9759)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Toggle the table to be hidden as admin user
    hideTable(ORDERS_ID);
  });

  it("hidden table should not show up in various places in UI", () => {
    // Visit the main page, we shouldn't be able to see the table
    cy.visit(`/browse/${PRODUCTS_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Products");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Orders").should("not.exist");

    // It shouldn't show up for a normal user either
    cy.signInAsNormalUser();
    cy.visit(`/browse/${PRODUCTS_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Products");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Orders").should("not.exist");

    // It shouldn't show in a new question data picker
    startNewQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sample Database").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Products");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Orders").should("not.exist");
  });
});

function hideTable(table) {
  const TABLE_URL = `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${table}`;

  cy.intercept("PUT", `/api/table/${table}`).as("tableUpdate");

  cy.visit(TABLE_URL);
  cy.contains(/^Hidden$/).click();
  cy.wait("@tableUpdate");
}
