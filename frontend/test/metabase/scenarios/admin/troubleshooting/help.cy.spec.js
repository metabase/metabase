import {
  describeOSS,
  describeEE,
  restore,
  setupMetabaseCloud,
} from "__support__/e2e/cypress";

describe("scenarios > admin > troubleshooting > help", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  // Unskip when mocking Cloud in Cypress is fixed (#18289)
  it.skip("should add the support link when running Metabase Cloud", () => {
    setupMetabaseCloud();
    cy.visit("/admin/troubleshooting/help");

    cy.findByText("Metabase Admin");
    cy.findByText("Contact support");
  });
});

describeOSS("scenarios > admin > troubleshooting > help", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should link `Get Help` to help", () => {
    cy.visit("/admin/troubleshooting/help");

    cy.findByText("Metabase Admin");
    cy.findByText("Get Help")
      .parents("a")
      .should("have.prop", "href")
      .and(
        "equal",
        "https://www.metabase.com/help?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help",
      );
  });
});

describeEE("scenarios > admin > troubleshooting > help (EE)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should link `Get Help` to help-premium", () => {
    cy.visit("/admin/troubleshooting/help");

    cy.findByText("Metabase Admin");
    cy.findByText("Get Help")
      .parents("a")
      .should("have.prop", "href")
      .and(
        "equal",
        "https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help",
      );
  });
});
