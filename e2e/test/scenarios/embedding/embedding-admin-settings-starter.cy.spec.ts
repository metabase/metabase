const { H } = cy;

describe("scenarios > embedding > admin settings > starter", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.activateToken("starter");

    H.updateSetting("show-sdk-embed-terms", false);
  });

  it("shows all embedding types without the setup guide", () => {
    cy.log("Navigate to Embedding admin section");
    cy.visit("/admin/embedding");

    cy.log("Check that we're on the embedding settings page");
    cy.url().should("include", "/admin/embedding");
    cy.get("main").findByText("Embedding settings").should("be.visible");

    cy.log("Verify sidebar does not contain setup guide");
    cy.findByTestId("admin-layout-sidebar")
      .findByRole("link", { name: /Setup guide/ })
      .should("not.exist");

    cy.log("Verify sidebar does not contain guest embeds link");
    cy.findByTestId("admin-layout-sidebar")
      .findByRole("link", { name: /Guest embeds/ })
      .should("not.exist");

    cy.log("Verify sidebar contains security settings link");
    cy.findByTestId("admin-layout-sidebar")
      .findByRole("link", { name: /Security/ })
      .should("exist");
  });

  it("should show embedding upsell on oss", () => {
    cy.visit("/admin/embedding/interactive");

    cy.findByTestId("admin-layout-content").within(() => {
      cy.findByRole("heading", { name: "Embedding settings" }).should(
        "be.visible",
      );

      cy.log("upsell gem icon should be visible");
      cy.icon("gem").should("be.visible");
    });
  });

  it("should show CORS setting on security page", () => {
    cy.visit("/admin/embedding/security");

    cy.findByTestId("admin-layout-content").within(() => {
      cy.findByText("Cross-Origin Resource Sharing (CORS)").should("exist");
    });
  });
});
