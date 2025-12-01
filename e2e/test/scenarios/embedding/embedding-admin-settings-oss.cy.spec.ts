const { H } = cy;

// These tests will run on both OSS and EE instances, both without a token.
describe(
  "scenarios > embedding > admin settings > oss",
  { tags: "@OSS" },
  () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.updateSetting("show-sdk-embed-terms", false);
    });

    it("shows all embedding types without the setup guide", () => {
      cy.log("Navigate to Embedding admin section");
      cy.visit("/admin/embedding");

      cy.log("Check that we're on the modular embedding page");
      cy.url().should("include", "/admin/embedding/modular");
      cy.get("main").findByText("Modular embedding").should("be.visible");

      cy.log("Verify sidebar contains static smbedding link");
      cy.findByTestId("admin-layout-sidebar")
        .findByRole("link", { name: /Static/ })
        .should("have.attr", "href", "/admin/embedding/static");

      cy.log("Verify sidebar contains interactive embedding");
      cy.findByTestId("admin-layout-sidebar")
        .findByRole("link", { name: /Interactive/ })
        .should("have.attr", "href", "/admin/embedding/interactive");

      cy.log("Verify sidebar does not contain setup guide");
      cy.findByTestId("admin-layout-sidebar")
        .findByRole("link", { name: /Setup guide/ })
        .should("not.exist");

      cy.log("Verify 2 upsell icons are present in sidebar");
      cy.findByTestId("admin-layout-sidebar")
        .icon("gem")
        .should("have.length", 2);
    });

    it("should show interactive embedding upsell on oss", () => {
      cy.visit("/admin/embedding/interactive");

      cy.findByTestId("admin-layout-content").within(() => {
        cy.findByRole("heading", { name: "Interactive embedding" }).should(
          "be.visible",
        );

        cy.log("upsell gem icon should be visible");
        cy.icon("gem").should("be.visible");

        cy.findByRole("link", { name: /Check out our Quickstart/i })
          .should("be.visible")
          .and("have.attr", "href")
          .and("contain", "interactive-embedding-quick-start-guide");

        cy.findByRole("link", { name: "Try for free" }).should("be.visible");
      });
    });
  },
);
