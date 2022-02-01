import {
  restore,
  describeWithToken,
  openNativeEditor,
} from "__support__/e2e/cypress";

describeWithToken("audit > ad-hoc", () => {
  describe("native query", () => {
    beforeEach(() => {
      restore();

      cy.log("Run ad hoc native query as normal user");
      cy.signInAsNormalUser();

      openNativeEditor().type("SELECT 123");
      cy.icon("play").first().click();

      // make sure results rendered before moving forward
      cy.get(".ScalarValue").contains("123");

      // Sign in as admin to be able to access audit logs in tests
      cy.signInAsAdmin();
    });

    it("should appear in audit log (metabase#16845 metabase-enterprise#486)", () => {
      cy.visit("/admin/audit/members/log");

      cy.findByText("Native")
        .parent()
        .parent()
        .within(() => {
          cy.findByText("Ad-hoc").click();
        });

      cy.log("Assert that the query page is not blank");
      cy.url().should("include", "/admin/audit/query/");

      cy.get(".PageTitle").contains("Query");
      cy.findByText("Open in Metabase");
      cy.get(".ace_content").contains("SELECT 123");
    });
  });
});
