import { restore } from "e2e/support/helpers";

describe("scenarios > browse data", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("basic UI flow should work", () => {
    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Browse data/).click();
    cy.location("pathname").should("eq", "/browse");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^Our data$/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sample Database").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rustic Paper Wallet");
  });
});
