import { restore, setupMetabaseCloud } from "e2e/support/helpers";

// Unskip when mocking Cloud in Cypress is fixed (#18289)
describe.skip("Cloud settings section", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be visible when running Metabase Cloud", () => {
    setupMetabaseCloud();
    cy.visit("/admin");
    cy.get(".AdminList-items").findByText("Cloud").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Cloud Settings/i);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Go to the Metabase Store").should(
      "have.attr",
      "href",
      "https://store.metabase.com/",
    );
  });

  it("should be invisible when self-hosting", () => {
    cy.visit("/admin");
    cy.get(".AdminList-items").findByText("Cloud").should("not.exist");
    cy.visit("/admin/settings/cloud");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Cloud Settings/i).should("not.exist");
  });
});
