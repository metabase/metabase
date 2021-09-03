import {
  describeWithoutToken,
  describeWithToken,
  restore,
  setupMetabaseCloud,
} from "__support__/e2e/cypress";

describe("scenarios > admin > troubleshooting > help", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add the support link when running Metabase Cloud", () => {
    setupMetabaseCloud();
    cy.visit("/admin/troubleshooting/help");

    cy.findByText("Metabase Admin");
    cy.findByText("Contact support");
  });

  describeWithoutToken("OSS", () => {
    it("should hide the support link when running Metabase OSS", () => {
      cy.visit("/admin/troubleshooting/help");

      cy.findByText("Metabase Admin");
      cy.findByText("Contact support").should("not.exist");
    });
  });

  describeWithToken("EE", () => {
    it("should add the support link when running Metabase Enterprise", () => {
      cy.visit("/admin/troubleshooting/help");

      cy.findByText("Metabase Admin");
      cy.findByText("Contact support");
    });
  });
});
