const { H } = cy;

describe("scenarios > question > snowplow", () => {
  describe("chart_generated", () => {
    const generateNonTableVisualization = () => {
      cy.visit("/");
      H.openOrdersTable();
      H.summarize();

      // Change query to render a bar chart
      H.clickSummaryField("Quantity", { section: "Orders" });
      H.echartsContainer().findByText("Count").should("be.visible");
    };

    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.enableTracking();
    });

    it("should track first non-table visualization rendered", () => {
      generateNonTableVisualization();

      // Ensure chart_generated event is tracked
      H.expectUnstructuredSnowplowEvent({
        event: "chart_generated",
        event_detail: "bar",
      });

      // Reset and generate non-table visualization second time
      H.resetSnowplow();
      generateNonTableVisualization();

      // Should not track chart_generated event again
      H.assertNoUnstructuredSnowplowEvent({ event: "chart_generated" });
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });
  });
});
