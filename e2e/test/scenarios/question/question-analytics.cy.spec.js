const { H } = cy;

H.describeWithSnowplow("scenarios > question > snowplow", () => {
  describe("chart_generated", () => {
    const NO_CHART_GENERATED_EVENTS_COUNT = 2;
    const WITH_CHART_GENERATED_EVENTS_COUNT = 3;

    const generateNonTableVisualization = () => {
      cy.visit("/");
      H.openOrdersTable();
      H.summarize();

      H.expectGoodSnowplowEvents(NO_CHART_GENERATED_EVENTS_COUNT);

      // Change query to render a bar chart
      H.rightSidebar().within(() => {
        cy.findByText("Quantity").click();
        cy.button("Done").click();
      });
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
      H.expectGoodSnowplowEvent({
        event: "chart_generated",
        event_detail: "bar",
      });
      H.expectGoodSnowplowEvents(WITH_CHART_GENERATED_EVENTS_COUNT);

      // Reset and generate non-table visualization second time
      H.resetSnowplow();
      generateNonTableVisualization();

      // Should not track chart_generated event again
      H.expectGoodSnowplowEvents(NO_CHART_GENERATED_EVENTS_COUNT);
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });
  });
});
