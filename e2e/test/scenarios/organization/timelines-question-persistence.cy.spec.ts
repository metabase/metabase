const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import type {
  Card,
  CardId,
  TimelineId,
  VisualizationSettings,
} from "metabase-types/api";
import { createMockDashboardCard } from "metabase-types/api/mocks";

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

    H.visitQuestion("@questionId");
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

    H.visitDashboard("@dashboardId");
    expectEvents(["Swallows return"], ["Swifts return"]);
  });

  it("should save destination collection events with a new question", () => {
    const collectionName = "Migration questions";

    H.createCollection({ name: collectionName }).then(({ body: { id } }) =>
      H.createTimelineWithEvents({
        timeline: { name: "Migration seasons", collection_id: id },
        events: EVENTS,
      }).then(({ timeline }) => cy.wrap(timeline.id).as("timelineId")),
    );
    cy.intercept(
      { method: "GET", url: "/api/timeline?include=events", times: 1 },
      (request) => {
        request.on("response", (response) => response.setDelay(5000));
      },
    ).as("getDelayedTimelines");
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
      },
      display: "line",
    });
    H.saveQuestionToCollection(
      "Bird sightings by month",
      { path: ["Our analytics", collectionName] },
      { wrapId: true },
    );
    cy.wait("@getDelayedTimelines");
    cy.get<CardId>("@questionId").then((id) =>
      cy.get<TimelineId>("@timelineId").then((timelineId) =>
        cy
          .request<Card>(`/api/card/${id}`)
          .its("body.visualization_settings")
          .should((settings) => {
            expect(settings["timeline.selected_timeline_ids"]).to.deep.equal([
              timelineId,
            ]);
          }),
      ),
    );
    cy.get<CardId>("@questionId").then((questionId) =>
      H.createDashboardWithTabs({
        dashcards: [
          createMockDashboardCard({
            id: -1,
            card_id: questionId,
            size_x: 12,
            size_y: 8,
          }),
        ],
      }).then((dashboard) => H.visitDashboard(dashboard.id)),
    );
    H.waitForDashcardsToLoad();
    expectEvents(EVENT_NAMES);

    cy.reload();
    H.waitForDashcardsToLoad();
    expectEvents(EVENT_NAMES);
  });

  it("should save a new question when collection timelines fail to load", () => {
    cy.intercept("GET", "/api/timeline?include=events", {
      statusCode: 500,
      body: { message: "Timelines are unavailable" },
    }).as("getFailedTimelines");
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
      },
      display: "line",
    });
    H.saveQuestionToCollection("Orders by month", undefined, { wrapId: true });

    cy.wait("@getFailedTimelines");
    cy.get<CardId>("@questionId").then((id) =>
      cy
        .request<Card>(`/api/card/${id}`)
        .its("body.visualization_settings")
        .should("not.have.property", "timeline.selected_timeline_ids"),
    );
  });

  it("should keep an explicitly empty selection hidden after saving and reloading the question and dashboard", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Migration seasons" },
      events: EVENTS,
    }).then(({ timeline }) =>
      createTimeSeries({ "timeline.selected_timeline_ids": [timeline.id] }),
    );

    H.visitQuestion("@questionId");
    expectEvents(EVENT_NAMES);
    openQuestionEvents();
    H.rightSidebar().within(() =>
      H.timelineVisibility("Migration seasons").click(),
    );
    expectEvents([], EVENT_NAMES);
    H.saveSavedQuestion();

    cy.get<CardId>("@questionId").then((id) => {
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

    H.visitDashboard("@dashboardId");
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

    H.visitQuestion("@questionId");
    expectEvents(EVENT_NAMES);
    openQuestionEvents();
    H.rightSidebar().within(() =>
      H.timelineVisibility("Migration seasons").click(),
    );
    expectEvents([], EVENT_NAMES);
    cy.findByTestId("qb-header").button("Save").should("be.visible");

    cy.log("reopen the question without saving");
    H.visitQuestion("@questionId");
    expectEvents(EVENT_NAMES);
    cy.get("@updateQuestion.all").should("have.length", 0);
  });

  it("should save event choices on a question that also uses a timeline the user cannot see", () => {
    createTimeSeriesWithHiddenTimeline();

    cy.signInAsNormalUser();
    H.visitQuestion("@questionId");
    expectEvents(EVENT_NAMES, ["Rare visitor"]);

    openQuestionEvents();
    H.rightSidebar()
      .should("contain", "Migration seasons")
      .and("not.contain", "Private sightings");
    H.rightSidebar().within(() =>
      H.toggleTimelineEventVisibility("Swifts return"),
    );
    expectEvents(["Swallows return"], ["Swifts return"]);
    H.saveSavedQuestion();

    cy.log("the timeline the user cannot see stays on the question");
    cy.get<TimelineId[]>("@timelineIds").then((timelineIds) =>
      cy.get<CardId>("@questionId").then((id) =>
        cy
          .request<Card>(`/api/card/${id}`)
          .its("body.visualization_settings")
          .should((settings: VisualizationSettings) =>
            expect(settings["timeline.selected_timeline_ids"]).to.have.members(
              timelineIds,
            ),
          ),
      ),
    );
    cy.reload();
    expectEvents(["Swallows return"], ["Swifts return", "Rare visitor"]);
  });

  it("should not save collection-default events when saving an unrelated chart change", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Migration seasons" },
      events: EVENTS,
    });
    createTimeSeries();

    H.visitQuestion("@questionId");
    expectEvents(EVENT_NAMES);
    H.openVizSettingsSidebar();
    H.vizSettingsSidebar().within(() => {
      cy.findByText("Display").click();
      cy.findByText("Show values on data points").click();
    });
    H.openVizSettingsSidebar();
    H.saveSavedQuestion();

    cy.get<CardId>("@questionId").then((id) => {
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
    H.visitDashboard("@dashboardId");
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

function createTimeSeriesWithHiddenTimeline() {
  return H.createTimelineWithEvents({
    timeline: { name: "Migration seasons" },
    events: EVENTS,
  }).then(({ timeline: visible }) =>
    H.createTimelineWithEvents({
      timeline: { name: "Private sightings" },
      events: [{ name: "Rare visitor", timestamp: "2027-06-20T00:00:00Z" }],
    }).then(({ timeline: hidden }) => {
      createTimeSeries({
        "timeline.selected_timeline_ids": [visible.id, hidden.id],
        "timeline.excluded_timeline_event_ids": [],
      });
      // the question keeps the selection once the timeline moves out of reach
      cy.request("PUT", `/api/timeline/${hidden.id}`, {
        collection_id: ADMIN_PERSONAL_COLLECTION_ID,
      });
      cy.wrap([visible.id, hidden.id]).as("timelineIds");
    }),
  );
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
