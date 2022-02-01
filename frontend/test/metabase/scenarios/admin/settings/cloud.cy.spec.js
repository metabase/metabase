import { restore, setupMetabaseCloud } from "__support__/e2e/cypress";

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
    cy.findByText(/Cloud Settings/i);
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
    cy.findByText(/Cloud Settings/i).should("not.exist");
  });
});
