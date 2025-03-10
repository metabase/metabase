const { H } = cy;

describe("scenarios > embedding > dashboard parameters", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    cy.intercept("GET", "/api/database").as("getDatabases");
    cy.intercept("GET", "/api/table/*").as("getTable");
  });

  it("should allow to open table data view", () => {
    cy.visit("/browse/databases");

    cy.wait("@getDatabases");

    cy.findByTestId("database-browser").findByText("Sample Database").click();
    cy.findByTestId("browse-schemas").findByText("People").click();

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
