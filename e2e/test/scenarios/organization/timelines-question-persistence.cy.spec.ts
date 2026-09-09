import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Card, Timeline, VisualizationSettings } from "metabase-types/api";

const { H } = cy;
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const EVENTS = [
  { name: "Swallows return", timestamp: "2027-04-20T00:00:00Z" },
  { name: "Swifts return", timestamp: "2027-08-20T00:00:00Z" },
];

describe("scenarios > organization > timelines > question persistence", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("saves a timeline from another collection and hidden events for every dashboard using the question", () => {
    H.createCollection({ name: "Migration calendar" }).then(
      ({ body: collection }) => {
        H.createTimelineWithEvents({
          timeline: { name: "Migration seasons", collection_id: collection.id },
          events: EVENTS,
        }).then(({ timeline }) => {
          createTimeSeries().then(({ questionId, body: { dashboard_id } }) => {
            H.createDashboard({
              name: "Another bird dashboard",
              dashcards: [
                {
                  id: -1,
                  card_id: questionId,
                  row: 0,
                  col: 0,
                  size_x: 12,
                  size_y: 8,
                },
              ],
            }).then(({ body: otherDashboard }) => {
              H.visitQuestion(questionId);
              expectEvents(
                [],
                EVENTS.map(({ name }) => name),
              );
              openQuestionEvents();
              H.rightSidebar().within(() => {
                H.timelineVisibility("Migration seasons").click();
                H.toggleTimelineEventVisibility("Swifts return");
              });
              expectEvents(["Swallows return"], ["Swifts return"]);
              H.saveSavedQuestion();

              cy.request<Timeline>({
                url: `/api/timeline/${timeline.id}`,
                qs: { include: "events" },
              }).then(({ body: savedTimeline }) => {
                const hiddenEventIds = (savedTimeline.events ?? [])
                  .filter(({ name }) => name === "Swifts return")
                  .map(({ id }) => id);
                expect(hiddenEventIds).to.have.length(1);
                cy.request<Card>(`/api/card/${questionId}`)
                  .its("body.visualization_settings")
                  .should("deep.include", {
                    "timeline.selected_timeline_ids": [timeline.id],
                    "timeline.excluded_timeline_event_ids": hiddenEventIds,
                  });
              });
              cy.reload();
              expectEvents(["Swallows return"], ["Swifts return"]);

              for (const dashboardId of [dashboard_id, otherDashboard.id]) {
                H.visitDashboard(dashboardId);
                expectEvents(["Swallows return"], ["Swifts return"]);
              }
            });
          });
        });
      },
    );
  });

  it("keeps an explicitly empty selection hidden after saving and reloading the question and dashboard", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Migration seasons" },
      events: EVENTS,
    }).then(({ timeline }) => {
      createTimeSeries({
        "timeline.selected_timeline_ids": [timeline.id],
      }).then(({ questionId, body: { dashboard_id } }) => {
        H.visitQuestion(questionId);
        expectEvents(EVENTS.map(({ name }) => name));
        openQuestionEvents();
        H.rightSidebar().within(() =>
          H.timelineVisibility("Migration seasons").click(),
        );
        expectEvents(
          [],
          EVENTS.map(({ name }) => name),
        );
        H.saveSavedQuestion();

        cy.request<Card>(`/api/card/${questionId}`)
          .its("body.visualization_settings")
          .should("have.property", "timeline.selected_timeline_ids")
          .and("deep.equal", []);
        cy.reload();
        expectEvents(
          [],
          EVENTS.map(({ name }) => name),
        );
        openQuestionEvents();
        H.rightSidebar().within(() =>
          H.timelineVisibility("Migration seasons").should("not.be.checked"),
        );

        H.visitDashboard(dashboard_id);
        expectEvents(
          [],
          EVENTS.map(({ name }) => name),
        );
        cy.reload();
        expectEvents(
          [],
          EVENTS.map(({ name }) => name),
        );
      });
    });
  });

  it("discards unsaved event choices when reopening a saved question", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Migration seasons" },
      events: EVENTS,
    }).then(({ timeline }) => {
      const savedSettings = { "timeline.selected_timeline_ids": [timeline.id] };
      createTimeSeries(savedSettings).then(
        ({ questionId, body: { dashboard_id } }) => {
          cy.intercept("PUT", `/api/card/${questionId}`).as("updateQuestion");
          H.visitQuestion(questionId);
          expectEvents(EVENTS.map(({ name }) => name));
          openQuestionEvents();
          H.rightSidebar().within(() =>
            H.timelineVisibility("Migration seasons").click(),
          );
          expectEvents(
            [],
            EVENTS.map(({ name }) => name),
          );
          cy.findByTestId("qb-header").button("Save").should("be.visible");

          H.visitQuestion(questionId);
          expectEvents(EVENTS.map(({ name }) => name));
          cy.get("@updateQuestion.all").should("have.length", 0);
          cy.request<Card>(`/api/card/${questionId}`)
            .its("body.visualization_settings")
            .should("deep.include", savedSettings);
          H.visitDashboard(dashboard_id);
          expectEvents(EVENTS.map(({ name }) => name));
        },
      );
    });
  });

  it("does not save collection-default events when saving an unrelated chart change", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Migration seasons" },
      events: EVENTS,
    });
    createTimeSeries().then(({ questionId, body: { dashboard_id } }) => {
      H.visitQuestion(questionId);
      expectEvents(EVENTS.map(({ name }) => name));
      H.openVizSettingsSidebar();
      H.vizSettingsSidebar().within(() => {
        cy.findByText("Display").click();
        cy.findByText("Show values on data points").click();
      });
      H.openVizSettingsSidebar();
      H.saveSavedQuestion();

      cy.request<Card>(`/api/card/${questionId}`)
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
      cy.reload();
      expectEvents(EVENTS.map(({ name }) => name));
      H.visitDashboard(dashboard_id);
      expectEvents(
        [],
        EVENTS.map(({ name }) => name),
      );
    });
  });
});

function createTimeSeries(visualization_settings: VisualizationSettings = {}) {
  return H.createQuestionAndDashboard({
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
  });
}

function openQuestionEvents() {
  cy.findByTestId("view-footer").icon("calendar").click();
  H.rightSidebar().should("be.visible");
}

function expectEvents(visible: string[], hidden: string[] = []) {
  H.echartsContainer().should("be.visible");
  for (const name of visible) {
    H.timelineEventChip(name).should("be.visible");
  }
  for (const name of hidden) {
    H.timelineEventChip(name).should("not.exist");
  }
}
