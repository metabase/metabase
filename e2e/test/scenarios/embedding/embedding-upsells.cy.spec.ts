const { H } = cy;

describe("scenarios > embedding > upsells", { tags: "@EE" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("show-sdk-embed-terms", false);
  });

  it("should show the sdk settings page with upsell button", () => {
    cy.on("window:before:load", (win) => {
      // prevent Cypress opening in a new window/tab and spy on this method
      cy.stub(win, "open").as("open");
    });

    cy.visit("/admin/settings/embedding-in-other-applications/sdk");

    mainPage().within(() => {
      cy.contains("SDK for React").should("be.visible");
      cy.contains("Embedded Analytics JS").should("be.visible");
    });

    cy.findByRole("button", { name: "Try for free" }).click();

    cy.get<sinon.SinonSpy>("@open").should((spy) => {
      const url = spy.getCall(0).args[0];

      expect(url).to.include(
        "https://test-store.metabase.com/checkout/upgrade/self-hosted",
      );

      expect(url).to.match(/utm_source=product/);
      expect(url).to.match(/utm_medium=upsell/);
      expect(url).to.match(/utm_campaign=embedded-analytics-js/);
      expect(url).to.match(/utm_content=embedding-page/);
      expect(url).to.match(/source_plan=oss/);
    });
  });

  it("should show the interactive embed card with upsell button", () => {
    cy.on("window:before:load", (win) => {
      // prevent Cypress opening in a new window/tab and spy on this method
      cy.stub(win, "open").as("open");
    });

    cy.visit("/admin/settings/embedding-in-other-applications");

    mainPage().within(() => {
      cy.contains("Interactive embedding").should("be.visible");
    });

    cy.findByRole("button", { name: "Try for free" }).click();

    cy.get<sinon.SinonSpy>("@open").should((spy) => {
      const url = spy.getCall(0).args[0];

      expect(url).to.include(
        "https://test-store.metabase.com/checkout/upgrade/self-hosted",
      );

      expect(url).to.match(/utm_source=product/);
      expect(url).to.match(/utm_medium=upsell/);
      expect(url).to.match(/utm_campaign=embedding-interactive/);
      expect(url).to.match(/utm_content=embedding-page/);
      expect(url).to.match(/source_plan=oss/);
    });
  });
});

function mainPage() {
  return cy.findByTestId("admin-layout-content");
}
