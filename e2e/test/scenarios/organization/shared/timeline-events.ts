const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const TIMELINE_API = /^\/api\/timeline/;

export function createQuestionAndDashboardWithEvents() {
  cy.intercept({ method: "GET", pathname: TIMELINE_API }).as("getTimelines");
  cy.intercept({ method: /POST|PUT|DELETE/, pathname: TIMELINE_API }).as(
    "mutateTimelineEvents",
  );

  H.createTimelineWithEvents({
    timeline: { name: "Releases" },
    events: [
      {
        name: "RC1",
        description: "The first release candidate is ready.",
        timestamp: "2027-10-20T00:00:00Z",
      },
    ],
  })
    .then(({ timeline }) =>
      H.createTimelineEvent({
        timeline_id: timeline.id,
        name: "Internal release notes",
        description: "Excluded release details.",
        timestamp: "2027-10-20T00:00:00Z",
      }).then(({ body: excludedEvent }) =>
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
              "timeline.excluded_timeline_event_ids": [excludedEvent.id],
            },
            enable_embedding: true,
          },
          dashboardDetails: { enable_embedding: true },
        }),
      ),
    )
    .then(({ body: { dashboard_id }, questionId }) => {
      cy.wrap(questionId).as("questionId");
      cy.wrap(dashboard_id).as("dashboardId");
    });

  H.createTimelineWithEvents({
    timeline: { name: "Operations" },
    events: [
      {
        name: "Internal review",
        description: "Unrelated timeline details.",
        timestamp: "2027-10-20T00:00:00Z",
      },
    ],
  });
}

export function expectChartWithoutEvents() {
  H.echartsContainer().findByText("Created At: Month").should("be.visible");
  H.timelineEventChip("RC1").should("not.exist");
  cy.findAllByTestId("timeline-event-chip").should("have.length", 0);
  cy.get("@getTimelines.all").should("have.length", 0);
}

export function expectReadOnlyDashboardEvents() {
  H.echartsContainer().findByText("Created At: Month").should("be.visible");
  H.timelineEventChip("RC1")
    .should("be.visible")
    .and("have.attr", "data-selected", "false")
    .click();

  H.timelineEventChip("RC1").should("have.attr", "data-selected", "false");
  cy.findByTestId("dashboard-events-sidebar").should("not.exist");
  cy.findByRole("button", { name: "Create event" }).should("not.exist");
  cy.findByRole("button", { name: "Events", exact: true }).should("not.exist");
  H.timelineEventChip("Internal release notes").should("not.exist");
  H.timelineEventChip("Internal review").should("not.exist");
  cy.findAllByTestId("timeline-event-chip").should("have.length", 1);

  H.timelineEventChip("RC1").realHover();
  cy.findByTestId("timeline-event-popover").within(() => {
    cy.findByText("RC1").should("be.visible");
    cy.findByText("The first release candidate is ready.").should("be.visible");
    cy.findByText("Internal release notes").should("not.exist");
    cy.findByText("Internal review").should("not.exist");
    cy.findByText("See all").should("not.exist");
    cy.findByRole("button", { name: /edit|create|delete/i }).should(
      "not.exist",
    );
    cy.findByRole("checkbox").should("not.exist");
  });
  cy.get("@mutateTimelineEvents.all").should("have.length", 0);
}
