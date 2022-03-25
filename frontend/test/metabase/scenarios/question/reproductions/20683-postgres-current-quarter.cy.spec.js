import { restore, visualize } from "__support__/e2e/cypress";

describe("issue 20683", () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    cy.visit("/");
    cy.findByText("New").click();
    cy.findByText("Question")
      .should("be.visible")
      .click();

    cy.findByText("QA Postgres12").click();
    cy.findByText("Orders").click();
  });

  it("should filter postgres with the 'current quarter' filter (metabase#20683)", () => {
    cy.findByText("Add filters to narrow your answer").click();

    cy.findByText("Created At").click();

    cy.findByText("Previous").click();
    cy.findByText("Current").click();

    cy.findByText("Day").click();
    cy.findByText("Quarter").click();

    cy.button("Add filter").click();

    visualize();

    // We don't have entries for the current quarter so we expect no results
    cy.findByText("No results!");
  });
});
