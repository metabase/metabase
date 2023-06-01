import { restore } from "e2e/support/helpers";

describe("banner", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show a database prompt banner when logged in as an admin, an instance is on a paid plan, and only have a single sample dataset", () => {
    cy.visit("/");

    cy.findByRole("banner", { name: "Database prompt banner" }).within(() => {
      cy.findByText(
        "Connect to your database to get the most from Metabase.",
      ).should("exist");

      cy.findByRole("link", { name: "Get help connecting" })
        .should("have.attr", "href")
        .and("eq", "https://metabase.com/help/connect");

      cy.findByRole("link", { name: "Connect your database" }).click();
      cy.url().should("include", "/admin/databases/create");
    });

    // Assert that database form is rendered
    cy.findByRole("main").within(() => {
      cy.findByText("Add Database").should("exist");
      cy.findByLabelText("Database type").should("exist");
      cy.findByLabelText("Database name").should("exist");
    });
  });
});
