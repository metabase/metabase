const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

/**
 * Creates a line question saved with one timeline event and a dashboard that
 * contains it, aliased as `@questionId` and `@dashboardId`.
 */
export function createQuestionAndDashboardWithEvents() {
  cy.intercept("GET", "/api/timeline?include=events").as("getTimelines");

  H.createTimelineWithEvents({
    timeline: { name: "Releases" },
    events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
  })
    .then(({ timeline }) =>
      H.createQuestionAndDashboard({
        questionDetails: {
          name: "Orders by month",
          display: "line",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          visualization_settings: {
            "timeline.selected_timeline_ids": [timeline.id],
            "timeline.excluded_timeline_event_ids": [],
          },
          enable_embedding: true,
        },
        dashboardDetails: { enable_embedding: true },
      }),
    )
    .then(({ body: { dashboard_id }, questionId }) => {
      cy.wrap(questionId).as("questionId");
      cy.wrap(dashboard_id).as("dashboardId");
    });
}

export function expectChartWithoutEvents() {
  H.echartsContainer().findByText("Created At: Month").should("be.visible");
  H.timelineEventChip("RC1").should("not.exist");
  cy.get("@getTimelines.all").should("have.length", 0);
}
