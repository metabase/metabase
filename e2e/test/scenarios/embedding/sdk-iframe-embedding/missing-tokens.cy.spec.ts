const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > without token features", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest({ withTokenFeatures: false });
    cy.signOut();
  });

  it("shows an error if the token features are missing and the parent page is not localhost", () => {
    cy.visit("http://localhost:4000");

    const frame = H.loadSdkIframeEmbedTestPage({
      origin: "http://example.com",
      template: "exploration",
    });

    frame
      .findByText("A valid license is required for embedding.")
      .should("be.visible");
  });

  it("does not show an error if the token features are missing and the parent page is localhost", () => {
    const frame = H.loadSdkIframeEmbedTestPage({
      template: "exploration",
    });

    frame
      .findByText("A valid license is required for embedding.")
      .should("not.exist");
  });
});
