const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > without token features", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest({ withTokenFeatures: false });
    cy.signOut();
  });

  it("should show the Not Found route if the token features are missing", () => {
    H.loadSdkIframeEmbedTestPage({ template: "exploration" })
      .findByText("Not found")
      .should("be.visible");
  });
});
