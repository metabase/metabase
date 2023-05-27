import {
  restore,
  describeEE,
  openNativeEditor,
  openOrdersTable,
} from "e2e/support/helpers";

describeEE("audit > ad-hoc", () => {
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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Native")
        .parent()
        .parent()
        .within(() => {
          cy.findByText("Ad-hoc").click();
        });

      cy.log("Assert that the query page is not blank");
      cy.url().should("include", "/admin/audit/query/");

      cy.get(".PageTitle").contains("Query");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Open in Metabase");
      cy.get(".ace_content").contains("SELECT 123");
    });
  });

  describe("notebook query", () => {
    beforeEach(() => {
      cy.intercept("/api/dataset").as("dataset");

      restore();

      cy.log("Run ad hoc notebook query as normal user");
      cy.signInAsNormalUser();
      openOrdersTable();

      cy.button("Visualize").click();
      cy.wait("@dataset");

      // Sign in as admin to be able to access audit logs in tests
      cy.signInAsAdmin();
    });

    it("should appear in audit log #29456", () => {
      cy.visit("/admin/audit/members/log");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("GUI")
        .parent()
        .parent()
        .within(() => {
          cy.findByText("Ad-hoc").click();
        });

      cy.log("Assert that the query page is not blank");
      cy.url().should("include", "/admin/audit/query/");

      cy.get(".PageTitle").contains("Query");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Open in Metabase").should("be.visible");

      cy.findByTestId("read-only-notebook").within(() => {
        cy.findByTestId("data-step-cell").within(() => {
          cy.findByText("Orders");
        });
        cy.findByText(/Filter/i).should("not.exist");
      });
    });
  });
});
