const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > without token features", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest({
      withToken: "starter",

      // JWT requires a valid license to use, so we expect customers to use API keys when testing.
      enabledAuthMethods: ["api-key"],

      signOut: true,
    });
  });

  it("shows an error if the token features are missing and the parent page is not localhost", () => {
    cy.visit("http://localhost:4000");

    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        elements: [
          {
            component: "metabase-question",
            attributes: {
              questionId: "new",
            },
          },
        ],
        origin: "http://example.com",
        metabaseConfig: {
          apiKey,
        },
      });

      frame
        .findByText("A valid license is required for embedding.")
        .should("be.visible");
    });
  });

  it("does not show an error if the token features are missing and the parent page is localhost", () => {
    cy.get<string>("@apiKey").then((apiKey) => {
      const frame = H.loadSdkIframeEmbedTestPage({
        elements: [
          {
            component: "metabase-question",
            attributes: {
              questionId: "new",
            },
          },
        ],
        metabaseConfig: {
          apiKey,
        },
      });

      frame
        .findByText("A valid license is required for embedding.")
        .should("not.exist");
    });
  });
});
