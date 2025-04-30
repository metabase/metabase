const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > oss", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest({ withTokenFeatures: false });
    cy.signOut();
  });

  it("does not display the iframe if the token features are missing", () => {
    H.loadSdkIframeEmbedTestPage({
      template: "exploration",
      skipPageVisit: true,
    });

    cy.visit("/sdk-iframe-test-page");
  });
});
