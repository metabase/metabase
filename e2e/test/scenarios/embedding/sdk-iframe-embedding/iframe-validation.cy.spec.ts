const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > iframe validation", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    cy.signOut();
  });

  it("throws when target element is not found", () => {
    H.loadSdkIframeEmbedTestPage({
      target: "#not-existent-target",
      expectErrors: true,
    });

    cy.get("@consoleError").should(
      "be.calledWith",
      '[metabase.embed] cannot find embed container "#not-existent-target"',
    );
  });

  it("throws when target element is undefined", () => {
    H.loadSdkIframeEmbedTestPage({
      target: undefined,
      expectErrors: true,
    });

    cy.get("@consoleError").should(
      "be.calledWith",
      '[metabase.embed] cannot find embed container "undefined"',
    );
  });

  it("throws when api key is not provided", () => {
    H.loadSdkIframeEmbedTestPage({
      apiKey: undefined,
      expectErrors: true,
    });

    cy.get("@consoleError").should(
      "be.calledWith",
      "[metabase.embed] api key and instance url must be provided",
    );
  });

  it("throws when instance url is not provided", () => {
    H.loadSdkIframeEmbedTestPage({
      apiKey: "foobar",
      instanceUrl: undefined,
      expectErrors: true,
    });

    cy.get("@consoleError").should(
      "be.calledWith",
      "[metabase.embed] api key and instance url must be provided",
    );
  });

  it("throws when both question id and dashboard id are provided", () => {
    H.loadSdkIframeEmbedTestPage({
      questionId: 10,
      dashboardId: 10,
      expectErrors: true,
    });

    cy.get("@consoleError").should(
      "be.calledWith",
      "[metabase.embed] can't use both dashboardId and questionId at the same time",
    );
  });

  it("throws when question id is provided in the exploration template", () => {
    H.loadSdkIframeEmbedTestPage({
      template: "exploration",
      questionId: 10,
      expectErrors: true,
    });

    cy.get("@consoleError").should(
      "be.calledWith",
      "[metabase.embed] the exploration template can't be used with dashboardId or questionId",
    );
  });

  it("throws when dashboard id is provided in the exploration template", () => {
    H.loadSdkIframeEmbedTestPage({
      template: "exploration",
      dashboardId: 10,
      expectErrors: true,
    });

    cy.get("@consoleError").should(
      "be.calledWith",
      "[metabase.embed] the exploration template can't be used with dashboardId or questionId",
    );
  });
});
