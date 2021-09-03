import {
  describeWithToken,
  restore,
  setupMetabaseCloud,
} from "__support__/e2e/cypress";

describe("scenarios > admin > troubleshooting > help", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add a support link when running Metabase Cloud", () => {
    setupMetabaseCloud();
    cy.visit("/admin/troubleshooting/help");
    cy.findByText("Contact support");
  });

  describeWithToken("EE", () => {
    it("should add a support link when running Metabase Enterprise", () => {
      cy.visit("/admin/troubleshooting/help");
      cy.findByText("Contact support");
    });
  });
});
