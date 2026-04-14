const { H } = cy;

describe("custom visualization fallback", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
  });

  it("should fall back to the default viz when the bundle endpoint fails, then recover on revisit", () => {
    H.setupCustomVizPlugin().then((plugin) => {
      cy.request("POST", "/api/card", {
        name: "Custom Viz Unavailable Bundle Test",
        dataset_query: {
          type: "query",
          query: { "source-table": 1, aggregation: [["count"]] },
          database: 1,
        },
        display: H.CUSTOM_VIZ_DISPLAY,
        visualization_settings: {},
      }).then(({ body: card }) => {
        const bundleMatcher = {
          method: "GET",
          pathname: `/api/ee/custom-viz-plugin/${plugin.id}/bundle`,
        };

        cy.intercept(bundleMatcher, {
          statusCode: 503,
          body: { error: "Bundle not available" },
        }).as("bundleUnavailable");

        H.visitQuestion(card.id);
        cy.wait("@bundleUnavailable");

        cy.findByTestId("table-root").should("be.visible");

        H.undoToast()
          .findByText(/visualization is currently unavailable/i)
          .should("be.visible");

        cy.intercept(bundleMatcher, (req) => req.continue()).as(
          "bundleRestored",
        );

        cy.findByTestId("main-logo-link").click();
        cy.go("back");
        cy.wait("@bundleRestored");

        cy.get("main")
          .findByText("Custom viz rendered successfully")
          .should("be.visible");
      });
    });
  });
});
