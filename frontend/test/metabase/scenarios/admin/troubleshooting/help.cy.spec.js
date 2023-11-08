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
});

describeWithoutToken("scenarios > admin > troubleshooting > help", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should hide the support link when running Metabase OSS", () => {
    cy.visit("/admin/troubleshooting/help");

    cy.findByText("Metabase Admin");
    cy.findByText("Contact support").should("not.exist");
  });
});

describeWithToken("scenarios > admin > troubleshooting > help (EE)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add the support link when running Metabase EE", () => {
    cy.visit("/admin/troubleshooting/help");

    cy.findByText("Metabase Admin");
    cy.findByText("Contact support");
  });
});
