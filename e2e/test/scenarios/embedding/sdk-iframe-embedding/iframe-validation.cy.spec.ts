const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > iframe validation", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    cy.signOut();
  });

  it("raises an error when target element is not found", () => {
    H.loadSdkIframeEmbedTestPage({
      target: "#not-existent-target",
      expectErrors: true,
    });

    cy.get("@consoleError").should(
      "be.calledWith",
      '[metabase.embed] cannot find embed container "#not-existent-target"',
    );
  });

  it("raises an error when target element is not provided", () => {
    H.loadSdkIframeEmbedTestPage({
      target: undefined,
      expectErrors: true,
    });

    cy.get("@consoleError").should(
      "be.calledWith",
      '[metabase.embed] cannot find embed container "undefined"',
    );
  });

  it("raises an error when api key is not provided", () => {
    H.loadSdkIframeEmbedTestPage({
      apiKey: undefined,
      expectErrors: true,
    });

    cy.get("@consoleError").should(
      "be.calledWith",
      "[metabase.embed] api key and instance url must be provided",
    );
  });
});
