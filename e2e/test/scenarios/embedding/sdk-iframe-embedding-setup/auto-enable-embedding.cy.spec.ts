const { H } = cy;

const suiteTitle =
  "scenarios > embedding > sdk iframe embed setup > auto enable embedding settings";

describe(suiteTitle, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.updateSetting("enable-embedding-simple", false);

    cy.intercept("GET", "/api/dashboard/*").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
    H.mockEmbedJsToDevServer();
  });

  it("auto-enables the enable-embedding-simple settings", () => {
    cy.visit("/embed-js");

    cy.log("simple embedding toast should be shown");
    H.undoToast()
      .should("be.visible")
      .findByText(/Embedded Analytics JS is enabled/)
      .should("be.visible");

    H.waitForSimpleEmbedIframesToLoad();

    cy.log("embed preview should be visible");
    H.getSimpleEmbedIframeContent().within(() => {
      cy.findByText("Orders in a dashboard").should("be.visible");
    });
  });
});
