import { restore, visualize } from "e2e/support/helpers";

describe("issue 20683", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Question").should("be.visible").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("QA Postgres12").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders").click();
  });

  it("should filter postgres with the 'current quarter' filter (metabase#20683)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add filters to narrow your answer").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Relative dates...").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Past").click({ force: true });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Current").click({ force: true });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Quarter").click();

    visualize();

    // We don't have entries for the current quarter so we expect no results
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No results!");
  });
});
