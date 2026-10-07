const { H } = cy;

const assertSidebarWithoutSetupGuide = () => {
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
};

const assertCorsSettingOnSecurityPage = () => {
  cy.log("Security page shows the CORS setting");
  cy.visit("/admin/embedding/security");

  cy.findByTestId("admin-layout-content").within(() => {
    cy.findByText("Cross-Origin Resource Sharing (CORS)").should("exist");
  });
};

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
      assertSidebarWithoutSetupGuide();
      assertCorsSettingOnSecurityPage();
    });

    it("should show embedding upsell on oss", () => {
      cy.visit("/admin/embedding/interactive");

      cy.findByTestId("admin-layout-content").within(() => {
        cy.findByRole("heading", { name: "Embedding settings" }).should(
          "be.visible",
        );

        cy.log("upsell gem icon should be visible");
        cy.icon("gem").should("be.visible");

        cy.findByRole("link", { name: "Upgrade" })
          .should("have.attr", "href")
          .and(
            "eq",
            "https://www.metabase.com/upgrade?utm_source=product&utm_medium=upsell&utm_content=embedding-page&source_plan=oss&utm_users=10&utm_campaign=embedding-methods",
          );
      });
    });
  },
);

describe("scenarios > embedding > admin settings > starter", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.activateToken("starter");

    H.updateSetting("show-sdk-embed-terms", false);
  });

  it("shows all embedding types without the setup guide", () => {
    assertSidebarWithoutSetupGuide();
    assertCorsSettingOnSecurityPage();
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
});
