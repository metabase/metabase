import { restore, setTokenFeatures } from "e2e/support/helpers";

// Unskip when mocking Cloud in Cypress is fixed (#18289)
describe("Cloud settings section", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be visible when running Metabase Cloud", () => {
    // Setting to none will give us an instance where token-features.hosting is set to true
    // Allowing us to pretend that we are a hosted instance (seems backwards though haha)

    setTokenFeatures("none");
    cy.visit("/admin");
    cy.findByTestId("admin-list-settings-items").findByText("Cloud").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Cloud Settings/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Go to the Metabase Store").should(
      "have.attr",
      "href",
      "https://store.metabase.com/",
    );
  });

  it("should prompt us to migrate to cloud if we are not hosted", () => {
    setTokenFeatures("all");
    cy.visit("/admin");
    cy.findByTestId("admin-list-settings-items").findByText("Cloud").click();

    cy.location("pathname").should("contain", "/admin/settings/cloud");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Migrate to Cloud/i).should("exist");
    cy.button("Get started").should("exist");
  });
});
