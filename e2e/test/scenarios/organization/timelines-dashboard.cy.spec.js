const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Orders by month",
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};

describe("scenarios > organization > timelines > dashboard", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/timeline-event").as("createEvent");
  });

  it("should create the first event and timeline", () => {
    visitDashboardWithTimeSeries();
    openEventsSidebar();

    eventsSidebar().button("Create event").click();
    createEvent("RC1", "10/20/2027");

    eventsSidebar().within(() => {
      timelineVisibility("Our analytics events").should("be.checked");
      H.timelineEventVisibility("RC1").should("be.checked");
    });
    H.timelineEventChip("RC1").should("be.visible");
  });

  it("should not list timelines without events", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Releases" },
      events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
    });
    H.createTimeline({ name: "Empty timeline" });

    visitDashboardWithTimeSeries();
    openEventsSidebar();

    eventsSidebar().within(() => {
      cy.findByText("Releases").should("be.visible");
      cy.findByText("Empty timeline").should("not.exist");
    });
  });

  it("should show the whole timeline when creating an event on a hidden timeline", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Releases" },
      events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
    });

    visitDashboardWithTimeSeries();
    openEventsSidebar();

    eventsSidebar().within(() => {
      H.timelineEventVisibility("RC1").should("not.be.checked");
    });
    H.timelineEventChip("RC1").should("not.exist");

    eventsSidebar().button("Create event").click();
    createEvent("RC2", "10/30/2027");

    eventsSidebar().within(() => {
      timelineVisibility("Releases").should("be.checked");
      H.timelineEventVisibility("RC1").should("be.checked");
      H.timelineEventVisibility("RC2").should("be.checked");
    });
    H.timelineEventChip("RC1").should("be.visible");
    H.timelineEventChip("RC2").should("be.visible");
  });

  describe("analytics", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.enableTracking();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should track a dashboard showing events once per load", () => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases" },
        events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
      }).then(({ timeline }) => {
        visitDashboardWithTimeSeries({
          "timeline.selected_timeline_ids": [timeline.id],
          "timeline.excluded_timeline_event_ids": [],
        });
      });
      H.timelineEventChip("RC1").should("be.visible");
      expectEventsShownOnce();

      openEventsSidebar();
      toggleEventVisibility("RC1");
      H.timelineEventChip("RC1").should("not.exist");
      toggleEventVisibility("RC1");
      H.timelineEventChip("RC1").should("be.visible");
      expectEventsShownOnce();
    });
  });
});

function visitDashboardWithTimeSeries(visualizationSettings = {}) {
  H.createQuestionAndDashboard({
    questionDetails: {
      ...questionDetails,
      visualization_settings: visualizationSettings,
    },
  }).then(({ body: { dashboard_id } }) => {
    cy.wrap(dashboard_id).as("dashboardId");
    H.visitDashboard(dashboard_id);
  });
  H.getDashboardCard().findByText("Created At: Month").should("be.visible");
}

function expectEventsShownOnce() {
  cy.get("@dashboardId").then((dashboardId) => {
    H.expectUnstructuredSnowplowEvent(
      { event: "dashboard_events_shown", target_id: dashboardId },
      1,
    );
  });
}

function toggleEventVisibility(eventName) {
  eventsSidebar().within(() => H.timelineEventVisibility(eventName).click());
}

function openEventsSidebar() {
  H.openDashboardMenu("Events");
  eventsSidebar().should("be.visible");
}

function eventsSidebar() {
  return cy.findByTestId("dashboard-events-sidebar");
}

function createEvent(name, date) {
  H.modal().within(() => {
    cy.findByLabelText("Event name").type(name);
    cy.findByLabelText("Date").type(date);
    cy.button("Create").click();
  });
  cy.wait("@createEvent");
  H.modal().should("not.exist");
  H.waitForTimelinesAfterCreatingAnEvent(name);
}

function timelineVisibility(timelineName) {
  return cy
    .findByText(timelineName)
    .closest("[aria-label='Timeline card header']")
    .findByRole("checkbox");
}
