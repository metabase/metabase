const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;
const { ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP } = USER_GROUPS;

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
      H.timelineVisibility("Our analytics events").should("be.checked");
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
      H.timelineVisibility("Releases").should("be.checked");
      H.timelineEventVisibility("RC1").should("be.checked");
      H.timelineEventVisibility("RC2").should("be.checked");
    });
    H.timelineEventChip("RC1").should("be.visible");
    H.timelineEventChip("RC2").should("be.visible");
  });

  it("should deep duplicate a dashboard whose question selects an inaccessible timeline", () => {
    H.createCollection({ name: "Events" }).then(({ body: { id } }) => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases", collection_id: id },
        events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
      }).then(({ timeline }) => {
        H.createQuestionAndDashboard({
          questionDetails: {
            ...questionDetails,
            visualization_settings: {
              "timeline.selected_timeline_ids": [timeline.id],
            },
          },
        }).then(({ body: { dashboard_id } }) => {
          cy.wrap(dashboard_id).as("dashboardId");
          cy.intercept("POST", `/api/dashboard/${dashboard_id}/copy`).as(
            "copyDashboard",
          );
        });
      });
      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { [id]: "none" },
        [COLLECTION_GROUP]: { [id]: "none" },
        [DATA_GROUP]: { [id]: "none" },
      });
    });

    cy.signInAsNormalUser();
    H.visitDashboard("@dashboardId");
    H.openDashboardMenu();
    H.popover().findByText("Duplicate").click();
    H.modal().within(() => {
      cy.findByLabelText("Only duplicate the dashboard").should(
        "not.be.checked",
      );
      cy.button("Duplicate").click();
    });

    cy.wait("@copyDashboard").its("response.statusCode").should("eq", 200);
    H.dashboardCards()
      .findByText("Orders by month - Duplicate")
      .should("be.visible");
  });

  it("should not let a user add a card with a restricted timeline to a public dashboard", () => {
    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });
    H.createCollection({ name: "Restricted" }).then(({ body: { id } }) => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases", collection_id: id },
        events: [
          { name: "Secret bday party", timestamp: "2027-10-20T00:00:00Z" },
        ],
      }).then(({ timeline }) => {
        H.createQuestion({
          ...questionDetails,
          visualization_settings: {
            "timeline.selected_timeline_ids": [timeline.id],
          },
        });
      });
      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { [id]: "none" },
        [COLLECTION_GROUP]: { [id]: "none" },
        [DATA_GROUP]: { [id]: "none" },
      });
    });
    H.createDashboard({ name: "Shared dashboard" }).then(({ body: { id } }) => {
      H.createPublicDashboardLink(id);
      cy.wrap(id).as("dashboardId");
    });

    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/dashboard/*").as("saveDashboard");
    H.visitDashboard("@dashboardId");
    H.editDashboard();
    H.openQuestionsSidebar();
    H.sidebar().findByText("Orders by month").click();
    H.getDashboardCards().should("have.length", 1);
    cy.findByTestId("edit-bar").findByTestId("save-edit-button").click();

    cy.wait("@saveDashboard").its("response.statusCode").should("eq", 403);
    cy.get("@dashboardId").then((id) => {
      cy.signInAsAdmin();
      cy.request("GET", `/api/dashboard/${id}`)
        .its("body.dashcards")
        .should("have.length", 0);
    });
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
  eventsSidebar().within(() => H.toggleTimelineEventVisibility(eventName));
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
