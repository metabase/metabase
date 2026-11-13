const { H } = cy;
import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ORDERS_BY_YEAR_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  Card,
  CardId,
  TimelineId,
  VisualizationSettings,
} from "metabase-types/api";
import { createMockDashboardCard } from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;
const { ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP } = USER_GROUPS;

const EVENTS = [
  { name: "Swallows return", timestamp: "2027-04-20T00:00:00Z" },
  { name: "Swifts return", timestamp: "2027-08-20T00:00:00Z" },
];
const EVENT_NAMES = EVENTS.map(({ name }) => name);

describe("scenarios > organization > timelines > question", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should create the first event and timeline", () => {
    cy.intercept("POST", "/api/timeline-event").as("createEvent");
    H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);

    openQuestionEvents();
    H.rightSidebar().button("Create event").click();
    H.modal().within(() => {
      cy.findByLabelText("Event name").type("RC1");
      cy.findByLabelText("Date").type("10/20/2027");
      cy.button("Create").click();
    });
    cy.wait("@createEvent");

    H.rightSidebar().within(() => {
      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC1").should("be.visible");
    });

    cy.log("the event, its creator and its new timeline are stored");
    cy.reload();
    openQuestionEvents();
    H.rightSidebar().within(() => {
      cy.findByText("Our analytics events").should("be.visible");
      cy.findByText("RC1").should("be.visible");
      cy.findByText(/^Bobby Tables added this on/).should("be.visible");
    });
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

  it("should save a question as a new one while it uses a timeline the user cannot see", () => {
    createTimeSeriesWithHiddenTimeline();

    cy.signInAsNormalUser();
    H.visitQuestion("@questionId");
    openQuestionEvents();
    H.rightSidebar().within(() =>
      H.toggleTimelineEventVisibility("Swifts return"),
    );
    expectEvents(["Swallows return"], ["Swifts return"]);

    cy.intercept("POST", "/api/card").as("createQuestion");
    cy.findByTestId("qb-header").button("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByText("Save as new question").click();
      cy.button("Save").click();
    });
    cy.wait("@createQuestion").its("response.statusCode").should("eq", 200);

    cy.log("the new question keeps the timeline the user cannot see");
    cy.get<TimelineId[]>("@timelineIds").then((timelineIds) =>
      cy
        .get("@createQuestion")
        .its("response.body.visualization_settings")
        .should((settings: VisualizationSettings) =>
          expect(settings["timeline.selected_timeline_ids"]).to.have.members(
            timelineIds,
          ),
        ),
    );
    expectEvents(["Swallows return"], ["Swifts return", "Rare visitor"]);
  });

  it("should duplicate a question whose selected timeline the user cannot access", () => {
    cy.intercept("POST", "/api/card").as("cardCreate");
    H.createCollection({ name: "Events" }).then(({ body: { id } }) => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases", collection_id: id },
        events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
      }).then(({ timeline }) => {
        H.createQuestion(
          {
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
            },
          },
          { wrapId: true },
        );
      });
      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { [id]: "none" },
        [COLLECTION_GROUP]: { [id]: "none" },
        [DATA_GROUP]: { [id]: "none" },
      });
    });

    cy.signInAsNormalUser();
    H.visitQuestion("@questionId");
    H.openQuestionActions();
    H.popover().findByText("Duplicate").click();
    H.modal().button("Duplicate").click();

    cy.wait("@cardCreate").its("response.statusCode").should("eq", 200);
    cy.findByTestId("qb-header-left-side")
      .findByDisplayValue("Orders by month - Duplicate")
      .should("be.visible");
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
