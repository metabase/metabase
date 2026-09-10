const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Card, VisualizationSettings } from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const EVENTS = [
  { name: "Swallows return", timestamp: "2027-04-20T00:00:00Z" },
  { name: "Swifts return", timestamp: "2027-08-20T00:00:00Z" },
];
const EVENT_NAMES = EVENTS.map(({ name }) => name);

describe("scenarios > organization > timelines > question persistence", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should save a timeline from another collection and hidden events for dashboards using the question", () => {
    H.createCollection({ name: "Migration calendar" }).then(
      ({ body: collection }) =>
        H.createTimelineWithEvents({
          timeline: { name: "Migration seasons", collection_id: collection.id },
          events: EVENTS,
        }).then(({ timeline, events }) => {
          cy.wrap(timeline.id).as("timelineId");
          cy.wrap(events[1].id).as("hiddenEventId");
        }),
    );
    createTimeSeries();

    cy.get<number>("@questionId").then((id) => H.visitQuestion(id));
    expectEvents([], EVENT_NAMES);
    openQuestionEvents();
    H.rightSidebar().within(() => {
      H.timelineVisibility("Migration seasons").click();
      H.toggleTimelineEventVisibility("Swifts return");
    });
    expectEvents(["Swallows return"], ["Swifts return"]);
    H.saveSavedQuestion();

    cy.then(function () {
      cy.request<Card>(`/api/card/${this.questionId}`)
        .its("body.visualization_settings")
        .should("deep.include", {
          "timeline.selected_timeline_ids": [this.timelineId],
          "timeline.excluded_timeline_event_ids": [this.hiddenEventId],
        });
    });
    cy.reload();
    expectEvents(["Swallows return"], ["Swifts return"]);

    cy.get<number>("@dashboardId").then((id) => H.visitDashboard(id));
    expectEvents(["Swallows return"], ["Swifts return"]);
  });

  it("should keep an explicitly empty selection hidden after saving and reloading the question and dashboard", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Migration seasons" },
      events: EVENTS,
    }).then(({ timeline }) =>
      createTimeSeries({ "timeline.selected_timeline_ids": [timeline.id] }),
    );

    cy.get<number>("@questionId").then((id) => H.visitQuestion(id));
    expectEvents(EVENT_NAMES);
    openQuestionEvents();
    H.rightSidebar().within(() =>
      H.timelineVisibility("Migration seasons").click(),
    );
    expectEvents([], EVENT_NAMES);
    H.saveSavedQuestion();

    cy.get<number>("@questionId").then((id) => {
      cy.request<Card>(`/api/card/${id}`)
        .its("body.visualization_settings")
        .should("have.property", "timeline.selected_timeline_ids")
        .and("deep.equal", []);
    });
    cy.reload();
    expectEvents([], EVENT_NAMES);
    openQuestionEvents();
    H.rightSidebar().within(() =>
      H.timelineVisibility("Migration seasons").should("not.be.checked"),
    );

    cy.get<number>("@dashboardId").then((id) => H.visitDashboard(id));
    expectEvents([], EVENT_NAMES);
  });

  it("should discard unsaved event choices when reopening a saved question", () => {
    cy.intercept("PUT", "/api/card/*").as("updateQuestion");
    H.createTimelineWithEvents({
      timeline: { name: "Migration seasons" },
      events: EVENTS,
    }).then(({ timeline }) =>
      createTimeSeries({ "timeline.selected_timeline_ids": [timeline.id] }),
    );

    cy.get<number>("@questionId").then((id) => H.visitQuestion(id));
    expectEvents(EVENT_NAMES);
    openQuestionEvents();
    H.rightSidebar().within(() =>
      H.timelineVisibility("Migration seasons").click(),
    );
    expectEvents([], EVENT_NAMES);
    cy.findByTestId("qb-header").button("Save").should("be.visible");

    cy.log("reopen the question without saving");
    cy.get<number>("@questionId").then((id) => H.visitQuestion(id));
    expectEvents(EVENT_NAMES);
    cy.get("@updateQuestion.all").should("have.length", 0);
  });

  it("should not save collection-default events when saving an unrelated chart change", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Migration seasons" },
      events: EVENTS,
    });
    createTimeSeries();

    cy.get<number>("@questionId").then((id) => H.visitQuestion(id));
    expectEvents(EVENT_NAMES);
    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByText("Show values on data points").click();
    });
    H.openVizSettingsSidebar();
    H.saveSavedQuestion();

    cy.get<number>("@questionId").then((id) => {
      cy.request<Card>(`/api/card/${id}`)
        .its("body.visualization_settings")
        .should((settings) => {
          expect(settings).to.include({ "graph.show_values": true });
          expect(settings).not.to.have.property(
            "timeline.selected_timeline_ids",
          );
          expect(settings).not.to.have.property(
            "timeline.excluded_timeline_event_ids",
          );
        });
    });
    cy.reload();
    expectEvents(EVENT_NAMES);

    cy.log("the dashboard only shows events saved on the question");
    cy.get<number>("@dashboardId").then((id) => H.visitDashboard(id));
    expectEvents([], EVENT_NAMES);
  });
});

function createTimeSeries(visualization_settings: VisualizationSettings = {}) {
  H.createQuestionAndDashboard({
    questionDetails: {
      name: "Bird sightings by month",
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      visualization_settings,
    },
    cardDetails: { size_x: 12, size_y: 8 },
  }).then(({ questionId, body: { dashboard_id } }) => {
    cy.wrap(questionId).as("questionId");
    cy.wrap(dashboard_id).as("dashboardId");
  });
}

function openQuestionEvents() {
  cy.findByTestId("view-footer").icon("calendar").click();
  H.rightSidebar().should("be.visible");
}

function expectEvents(visible: string[], hidden: string[] = []) {
  H.echartsContainer().should("be.visible");
  visible.forEach((name) => {
    H.timelineEventChip(name).should("be.visible");
  });
  hidden.forEach((name) => {
    H.timelineEventChip(name).should("not.exist");
  });
}
