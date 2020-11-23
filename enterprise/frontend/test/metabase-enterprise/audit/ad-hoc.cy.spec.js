import {
  restore,
  signInAsAdmin,
  signInAsNormalUser,
  describeWithToken,
} from "__support__/cypress";

describeWithToken("audit > ad-hoc", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  describe("native query with JOIN", () => {
    before(() => {
      cy.log("**Run ad hoc native query as normal user**");
      signInAsNormalUser();

      cy.visit("/question/new");
      cy.findByText("Native query").click();
      cy.get(".ace_content").type("SELECT 123");
      cy.get(".Icon-play")
        .first()
        .click();

      // make sure results rendered before moving forward
      cy.get(".ScalarValue").contains("123");
    });

    it.skip("should appear in audit log (metabase-enterprise#486)", () => {
      cy.visit("/admin/audit/members/log");

      cy.findByText("Native")
        .parent()
        .within(() => {
          cy.findByText("Ad-hoc").click();
        });

      cy.log("**Assert that the query page is not blank**");
      cy.url().should("include", "/admin/audit/query/");

      cy.get(".PageTitle").contains("Query");
      cy.findByText("Open in Metabase");
    });
  });
});
