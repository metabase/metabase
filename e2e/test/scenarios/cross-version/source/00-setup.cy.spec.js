import {
  version,
  setupLanguage,
  setupInstance,
} from "./helpers/cross-version-source-helpers";

describe(`setup on ${version}`, () => {
  it("should set up metabase", () => {
    cy.visit("/");
    // It redirects to the setup page
    cy.location("pathname").should("eq", "/setup");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Welcome to Metabase");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Let's get started").click();

    setupLanguage();
    setupInstance(version);

    cy.visit("/admin");
    cy.icon("store");
  });
});
