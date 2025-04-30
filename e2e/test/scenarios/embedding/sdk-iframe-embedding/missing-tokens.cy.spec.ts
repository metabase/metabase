const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > without token features", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest({ withTokenFeatures: false });
    cy.signOut();
  });

  // TODO: unskip this once we remove the token workaround for testing in `settings.ts`
  it.skip("should show the Not Found route if the token features are missing", () => {
    H.loadSdkIframeEmbedTestPage({ template: "exploration" })
      .findByText("Not found")
      .should("be.visible");
  });
});
