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

    // Quick and dirty sanity check for EE version
    // TODO: Remove or refactor properly
    if (version.startsWith("v1")) {
      cy.visit("/admin/settings/license");
      cy.findByPlaceholderText("Using MB_PREMIUM_EMBEDDING_TOKEN").should(
        "be.disabled",
      );
    } else {
      cy.visit("/admin");
      cy.icon("store");
    }
  });
});
