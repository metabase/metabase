import { restore } from "__support__/e2e/cypress";

const ORDERS_URL = "/admin/datamodel/database/1/table/2";

describe("scenarios > admin > datamodel > hidden tables (metabase#9759)", () => {
  beforeEach(restore);

  it("can hide a table and not show up in 'Our Data'", () => {
    cy.server();
    cy.route("PUT", "/api/table/*").as("tableUpdate");

    // Toggle the table to be hidden as admin user
    cy.signInAsAdmin();
    cy.visit(ORDERS_URL);
    cy.contains(/^Hidden$/).click();
    cy.wait("@tableUpdate");

    // Visit the main page, we shouldn't be able to see the table
    cy.visit("/browse/1");
    cy.contains("Products");
    cy.contains("Orders").should("not.exist");

    // It shouldn't show up as a normal user either
    cy.signInAsNormalUser();
    cy.visit("/browse/1");
    cy.contains("Products");
    cy.contains("Orders").should("not.exist");
  });

  it("can hide a table and not show up in 'New Question' for a user", () => {
    cy.server();
    cy.route("PUT", "/api/table/*").as("tableUpdate");

    // Toggle the table to be hidden as admin user
    cy.signInAsAdmin();
    cy.visit(ORDERS_URL);
    cy.contains(/^Hidden$/).click();
    cy.wait("@tableUpdate");

    // It shouldn't show up as a normal user either
    cy.signInAsNormalUser();
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Products");
    cy.contains("Orders").should("not.exist");
  });
});
