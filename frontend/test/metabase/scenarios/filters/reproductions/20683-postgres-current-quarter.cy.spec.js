import { restore, visualize } from "__support__/e2e/helpers";

describe("issue 20683", () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    cy.visit("/");
    cy.findByText("New").click();
    cy.findByText("Question").should("be.visible").click();

    cy.findByText("QA Postgres12").click();
    cy.findByText("Orders").click();
  });

  it("should filter postgres with the 'current quarter' filter (metabase#20683)", () => {
    cy.findByText("Add filters to narrow your answer").click();

    cy.findByText("Created At").click();

    cy.findByText("Relative dates...").click();
    cy.findByText("Past").click({ force: true });
    cy.findByText("Current").click({ force: true });

    cy.findByText("Quarter").click();

    visualize();

    // We don't have entries for the current quarter so we expect no results
    cy.findByText("No results!");
  });
});
