import {
  version,
  setupLanguage,
  setupInstance,
} from "./cross-version-source-helpers";

describe(`setup on ${version}`, () => {
  it("should set up metabase", () => {
    cy.visit("/");
    // It redirects to the setup page
    cy.location("pathname").should("eq", "/setup");
    cy.findByText("Welcome to Metabase");
    cy.findByText("Let's get started").click();

    setupLanguage();
    setupInstance(version);
  });
});
