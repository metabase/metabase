const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import type {
  StructuredQuestionDetails,
  TimelineEventDetails,
} from "e2e/support/helpers";
import type {
  CollectionId,
  CollectionPermission,
  CollectionPermissions,
  CreateTimelineRequest,
  DashboardCard,
  DashboardId,
  TimelineId,
  VisualizationSettings,
} from "metabase-types/api";
import { createMockDashboardCard } from "metabase-types/api/mocks";

const { ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP } = USER_GROUPS;

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails: StructuredQuestionDetails = {
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
    cy.get("@createEvent").its("request.body.source").should("eq", "dashboard");
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
    createEvent("RC2", "12/15/2027");

    eventsSidebar().within(() => {
      H.timelineVisibility("Releases").should("be.checked");
      H.timelineEventVisibility("RC1").should("be.checked");
      H.timelineEventVisibility("RC2").should("be.checked");
    });
    H.timelineEventChip("RC1").should("be.visible");
    H.timelineEventChip("RC2").should("be.visible");
  });

  it("should keep event visibility local to each copy of a question and restore saved choices on reload", () => {
    createReleaseTimeline().then(({ timeline }) => {
      visitDashboardWithCopies(timeline.id);
    });
    H.waitForDashcardsToLoad({ count: 2 });
    eventChip(0, "RC1").should("be.visible");
    eventChip(1, "RC1").should("be.visible");
    cy.intercept("PUT", "/api/card/*", cy.spy().as("questionUpdates"));
    cy.intercept("PUT", "/api/dashboard/*", cy.spy().as("dashboardUpdates"));

    eventChip(0, "RC1").click();
    eventsSidebar().should("be.visible");
    toggleEventVisibility("RC1");
    eventsSidebar().within(() => {
      H.timelineEventVisibility("RC1").should("not.be.checked");
    });
    eventChip(0, "RC1").should("not.exist");
    eventChip(1, "RC1").should("be.visible");
    cy.get("@questionUpdates").should("not.have.been.called");
    cy.get("@dashboardUpdates").should("not.have.been.called");

    cy.reload();
    H.waitForDashcardsToLoad({ count: 2 });
    eventChip(0, "RC1").should("be.visible");
    eventChip(1, "RC1").should("be.visible");
    eventsSidebar().should("not.exist");
  });

  it("should apply mixed dashboard event choices only to eligible cards on the current tab", () => {
    createReleaseTimeline().then(({ timeline }) => {
      H.createQuestion({
        ...questionDetails,
        name: "Orders table",
        display: "table",
        visualization_settings: {
          "timeline.selected_timeline_ids": [timeline.id],
        },
      }).then(({ body: table }) => {
        visitDashboardWithCopies(timeline.id, {
          withTabs: true,
          extraDashcards: [
            createMockDashboardCard({
              id: -4,
              card_id: table.id,
              dashboard_tab_id: -1,
              row: 7,
              size_x: 12,
              size_y: 6,
            }),
          ],
        });
      });
    });
    H.waitForDashcardsToLoad({ count: 3 });
    eventChip(0, "RC1").should("be.visible").click();
    toggleEventVisibility("RC1");
    eventChip(1, "RC1").should("be.visible");
    eventChip(0, "RC1").should("not.exist");
    closeEventsSidebar();
    openEventsSidebar();

    eventsSidebar().within(() => {
      H.timelineEventVisibility("RC1").should(
        "have.prop",
        "indeterminate",
        true,
      );
      H.toggleTimelineEventVisibility("RC1");
      H.timelineEventVisibility("RC1")
        .should("be.checked")
        .and("have.prop", "indeterminate", false);
    });
    eventChip(0, "RC1").should("be.visible");
    eventChip(1, "RC1").should("be.visible");
    H.getDashboardCard(2).findByText("Orders table").should("be.visible");
    H.getDashboardCard(2)
      .findByTestId("timeline-events-band")
      .should("not.exist");

    toggleEventVisibility("RC1");
    eventsSidebar().within(() => {
      H.timelineEventVisibility("RC1").should("not.be.checked");
    });
    eventChip(0, "RC1").should("not.exist");
    eventChip(1, "RC1").should("not.exist");
    H.goToTab("History");
    H.waitForDashcardsToLoad({ count: 1 });
    eventChip(0, "RC1").should("be.visible");
    H.goToTab("Overview");
    H.waitForDashcardsToLoad({ count: 3 });
    eventChip(0, "RC1").should("not.exist");
    eventChip(1, "RC1").should("not.exist");
  });

  it("should not offer events on a card too small to show them", () => {
    createReleaseTimeline().then(({ timeline }) => {
      H.createQuestion({
        ...questionDetails,
        visualization_settings: {
          "timeline.selected_timeline_ids": [timeline.id],
        },
      }).then(({ body: question }) => {
        H.createDashboardWithTabs({
          dashcards: [
            createMockDashboardCard({
              id: -1,
              card_id: question.id,
              size_x: 12,
              size_y: 6,
            }),
            createMockDashboardCard({
              id: -2,
              card_id: question.id,
              row: 6,
              size_x: 4,
              size_y: 3,
            }),
          ],
        }).then((dashboard) => H.visitDashboard(dashboard.id));
      });
    });
    H.waitForDashcardsToLoad({ count: 2 });

    eventChip(0, "RC1").should("be.visible");
    openDashCardMenu(0);
    H.menu().findByText("Events").should("be.visible");
    cy.realPress("Escape");
    H.menu().should("not.exist");

    H.getDashboardCard(1).findByText("Orders by month").should("be.visible");
    H.getDashboardCard(1)
      .findByTestId("timeline-event-chip")
      .should("not.exist");
    openDashCardMenu(1);
    H.menu().should("contain", "Download results").and("not.contain", "Events");
  });

  it("should update and archive an event from the dashboard in both the panel and chart", () => {
    cy.intercept("PUT", "/api/timeline-event/*").as("updateEvent");
    H.createTimelineWithEvents({
      timeline: { name: "Releases" },
      events: [
        { name: "RC1", timestamp: "2027-10-20T00:00:00Z" },
        { name: "Stable release", timestamp: "2028-01-15T00:00:00Z" },
      ],
    }).then(({ timeline }) => {
      visitDashboardWithTimeSeries({
        "timeline.selected_timeline_ids": [timeline.id],
      });
    });
    H.timelineEventChip("RC1").should("be.visible").click();
    eventsSidebar().within(() => {
      H.timelineEventCard("RC1")
        .findByRole("button", { name: "Event menu" })
        .click();
    });
    H.menu().findByText("Edit event").click();
    H.modal().within(() => {
      cy.findByLabelText("Event name").clear().type("RC2");
      cy.findByRole("button", { name: "Update" }).click();
    });
    cy.wait("@updateEvent");
    eventsSidebar().should("contain", "RC2").and("not.contain", "RC1");
    H.timelineEventChip("RC2").should("be.visible");
    H.timelineEventChip("RC1").should("not.exist");

    eventsSidebar().within(() => {
      H.timelineEventCard("RC2")
        .findByRole("button", { name: "Event menu" })
        .click();
    });
    H.menu().findByText("Archive event").click();
    cy.wait("@updateEvent");
    eventsSidebar().should("contain", "Releases").and("not.contain", "RC2");
    H.timelineEventChip("Stable release").should("be.visible");
    H.timelineEventChip("RC2").should("not.exist");
  });

  it("should select single and grouped dashboard chips and focus the matching panel entries", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Releases" },
      events: [
        { name: "Alpha", timestamp: "2027-10-03T00:00:00Z" },
        { name: "Beta", timestamp: "2027-10-10T00:00:00Z" },
        { name: "Stable release", timestamp: "2028-01-15T00:00:00Z" },
      ],
    }).then(({ timeline }) => visitDashboardWithCopies(timeline.id));
    H.waitForDashcardsToLoad({ count: 2 });

    eventChip(0, "2 events").should("be.visible").click();
    eventChip(0, "2 events").should("have.attr", "data-selected", "true");
    eventChip(1, "2 events").should("have.attr", "data-selected", "false");
    eventsSidebar()
      .should("contain", "Alpha")
      .and("contain", "Beta")
      .and("not.contain", "Stable release");
    eventsSidebar()
      .findByRole("button", { name: /All events/ })
      .click();
    eventsSidebar().findByText("Stable release").should("be.visible");

    eventChip(0, "Stable release").click();
    eventChip(0, "Stable release").should("have.attr", "data-selected", "true");
    eventChip(0, "2 events").should("have.attr", "data-selected", "false");
    eventChip(1, "Stable release").should(
      "have.attr",
      "data-selected",
      "false",
    );
    eventsSidebar().should("contain", "Stable release").and("contain", "Alpha");
    eventsSidebar()
      .findByRole("button", { name: /All events/ })
      .should("not.exist");
  });

  it("should clear the targeted events panel and selection when switching tabs or editing and removing a card", () => {
    createReleaseTimeline().then(({ timeline }) => {
      visitDashboardWithCopies(timeline.id, { withTabs: true });
    });
    H.waitForDashcardsToLoad({ count: 2 });
    eventChip(0, "RC1").should("be.visible").click();
    eventsSidebar().should("be.visible");
    H.goToTab("History");
    H.waitForDashcardsToLoad({ count: 1 });
    eventChip(0, "RC1")
      .should("be.visible")
      .and("have.attr", "data-selected", "false");
    eventsSidebar().should("not.exist");
    H.goToTab("Overview");
    H.waitForDashcardsToLoad({ count: 2 });
    eventChip(0, "RC1").should("have.attr", "data-selected", "false").click();
    eventsSidebar().should("be.visible");

    H.editDashboard();
    H.dashboardSaveButton().should("be.visible");
    eventsSidebar().should("not.exist");
    // hover away from the chart center, where the event popover would cover the card
    H.getDashboardCard(0)
      .realHover({ position: "topLeft" })
      .findByTestId("dashboardcard-actions-panel")
      .should("be.visible")
      .icon("close")
      .click({ force: true });
    H.saveDashboard();
    H.waitForDashcardsToLoad({ count: 1 });
    eventChip(0, "RC1")
      .should("be.visible")
      .and("have.attr", "data-selected", "false");
    eventsSidebar().should("not.exist");
    eventChip(0, "RC1").click();
    eventsSidebar().findByText("RC1").should("be.visible");
  });

  it("should keep chart data visible while restricting timeline details and editing to permitted collections", () => {
    H.createTimelineWithEvents({
      timeline: {
        name: "Private launches",
        collection_id: ADMIN_PERSONAL_COLLECTION_ID,
      },
      events: [{ name: "Secret release", timestamp: "2027-11-20T00:00:00Z" }],
    }).then(({ timeline }) => cy.wrap(timeline.id).as("privateTimelineId"));
    createReleaseTimeline().then(({ timeline }) =>
      cy.wrap(timeline.id).as("timelineId"),
    );
    cy.then(function () {
      H.createQuestionAndDashboard({
        questionDetails: {
          ...questionDetails,
          visualization_settings: {
            "timeline.selected_timeline_ids": [
              this.timelineId,
              this.privateTimelineId,
            ],
          },
        },
      }).then(({ body: { dashboard_id } }) => {
        cy.signOut();
        cy.signIn("readonly");
        H.visitDashboard(dashboard_id);
      });
    });
    H.getDashboardCard().findByText("Created At: Month").should("be.visible");
    H.timelineEventChip("RC1").should("be.visible");
    H.timelineEventChip("Secret release").should("not.exist");
    openEventsSidebar();
    eventsSidebar()
      .should("contain", "Releases")
      .and("not.contain", "Private launches")
      .and("not.contain", "Secret release");
    eventsSidebar()
      .findByRole("button", { name: "Create event" })
      .should("not.exist");
    eventsSidebar()
      .findByRole("button", { name: "Event menu" })
      .should("not.exist");
    toggleEventVisibility("RC1");
    eventsSidebar().within(() =>
      H.timelineEventVisibility("RC1").should("not.be.checked"),
    );
    H.timelineEventChip("RC1").should("not.exist");
    toggleEventVisibility("RC1");
    H.timelineEventChip("RC1").should("be.visible");
  });

  it("should filter dashboard event chips and panel entries with the chart date range", () => {
    H.createTimelineWithEvents({
      timeline: { name: "Releases" },
      events: [
        { name: "RC1", timestamp: "2027-10-20T00:00:00Z" },
        { name: "Stable release", timestamp: "2028-01-15T00:00:00Z" },
      ],
    }).then(({ timeline }) =>
      H.createQuestionAndDashboard({
        questionDetails: {
          ...questionDetails,
          visualization_settings: {
            "timeline.selected_timeline_ids": [timeline.id],
          },
        },
        dashboardDetails: {
          parameters: [
            { id: "date", name: "Date", slug: "date", type: "date/range" },
          ],
        },
      }).then(({ body: { id, dashboard_id }, questionId }) => {
        H.addOrUpdateDashboardCard({
          dashboard_id,
          card_id: questionId,
          card: {
            id,
            parameter_mappings: [
              {
                parameter_id: "date",
                card_id: questionId,
                target: [
                  "dimension",
                  [
                    "field",
                    ORDERS.CREATED_AT,
                    { "base-type": "type/DateTime" },
                  ],
                ],
              },
            ],
          },
        });
        H.visitDashboard(dashboard_id);
      }),
    );
    H.timelineEventChip("RC1").should("be.visible");
    H.timelineEventChip("Stable release").should("be.visible");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "filteredQuery",
    );
    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByLabelText("Start date").clear().type("10/01/2027").blur();
      cy.findByLabelText("End date").clear().type("11/30/2027").blur();
      cy.findByRole("button", { name: "Add filter" }).click();
    });
    cy.wait("@filteredQuery");
    H.timelineEventChip("RC1").should("be.visible").click();
    eventsSidebar()
      .should("contain", "RC1")
      .and("not.contain", "Stable release");
    H.timelineEventChip("Stable release").should("not.exist");
    closeEventsSidebar();
    H.clearFilterWidget();
    cy.wait("@filteredQuery");
    H.timelineEventChip("Stable release").should("be.visible");
    H.getDashboardCard().findByText("Created At: Month").should("be.visible");
  });

  it("should show an event only the card's series reaches", () => {
    visitDashboardWithSeriesReachingTheEvent();

    H.getDashboardCard().findByText("Orders by month").should("be.visible");
    eventChip(0, "RC1").should("be.visible").click();
    eventsSidebar().findByText("RC1").should("be.visible");
  });

  it("should show the replacing question's events after replacing a card", () => {
    createTimelineQuestion({
      timeline: { name: "Launches" },
      events: [{ name: "GA", timestamp: "2027-11-20T00:00:00Z" }],
      name: "Orders by month, launches",
    });
    visitDashboardWithReleaseEvents();

    eventChip(0, "RC1").should("be.visible").click();
    eventsSidebar().should("be.visible");

    // the replacement runs as a plain card query until the dashboard is saved
    cy.intercept("POST", "/api/card/*/query").as("replacedCardQuery");
    H.editDashboard();
    H.getDashboardCard()
      .realHover({ position: "topLeft" })
      .findByLabelText("Replace")
      .click();
    H.entityPickerModal().findByText("Orders by month, launches").click();
    cy.wait("@replacedCardQuery");
    H.saveDashboard();

    eventChip(0, "GA").should("be.visible");
    eventChip(0, "RC1").should("not.exist");
    eventChip(0, "GA").click();
    eventsSidebar().within(() => {
      H.timelineVisibility("Launches").should("be.checked");
      H.timelineVisibility("Releases").should("not.be.checked");
    });
  });

  it("should show the events of a metric and of a model", () => {
    visitDashboardWithMetricAndModel();
    H.waitForDashcardsToLoad({ count: 2 });

    eventChip(0, "RC1").should("be.visible");
    eventChip(1, "RC1").should("be.visible").click();
    eventsSidebar().findByText("RC1").should("be.visible");
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
      cy.updateCollectionGraph(denyCollection(id));
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

  it("should not let a user revert a public dashboard to a version with a restricted timeline card", () => {
    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });
    H.createCollection({ name: "Restricted" }).then(({ body: { id } }) => {
      H.createTimelineWithEvents({
        timeline: { name: "Releases", collection_id: id },
        events: [
          { name: "Secret bday party", timestamp: "2027-10-20T00:00:00Z" },
        ],
      }).then(({ timeline }) => {
        H.createQuestionAndDashboard({
          questionDetails: {
            ...questionDetails,
            visualization_settings: {
              "timeline.selected_timeline_ids": [timeline.id],
            },
          },
          dashboardDetails: { name: "Shared dashboard" },
        }).then(({ body: { dashboard_id } }) => {
          H.createPublicDashboardLink(dashboard_id);
          cy.wrap(dashboard_id).as("dashboardId");
          cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
            dashcards: [],
          });
        });
      });
      cy.updateCollectionGraph(denyCollection(id));
    });

    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/revision*").as("revisionHistory");
    cy.intercept("POST", "/api/revision/revert").as("revertDashboard");
    H.visitDashboard("@dashboardId");
    H.openDashboardInfoSidebar().within(() => {
      cy.findByRole("tab", { name: "History" }).click();
      cy.wait("@revisionHistory");
      cy.findAllByTestId("question-revert-button").first().click();
    });

    cy.wait("@revertDashboard").its("response.statusCode").should("eq", 403);
    H.undoToast().should(
      "contain.text",
      "You don't have permissions to do that.",
    );
    cy.get<DashboardId>("@dashboardId").then((id) => {
      cy.signInAsAdmin();
      cy.request("GET", `/api/dashboard/${id}`)
        .its("body.dashcards")
        .should("have.length", 0);
    });
  });

  describe("visualization type", () => {
    it("should keep the events after the question switches to another time series display", () => {
      visitQuestionWithReleaseEvents();

      H.openVizTypeSidebar();
      H.vizTypeSidebar().icon("area").click();
      H.saveSavedQuestion();

      cy.get<DashboardId>("@dashboardId").then(H.visitDashboard);
      eventChip(0, "RC1").should("be.visible");
      openEventsSidebar();
      eventsSidebar().findByText("Releases").should("be.visible");
    });

    it("should stop offering events once the question is no longer a time series", () => {
      visitQuestionWithReleaseEvents();

      H.openVizTypeSidebar();
      H.vizTypeSidebar().icon("table2").click();
      H.saveSavedQuestion();

      cy.get<DashboardId>("@dashboardId").then(H.visitDashboard);
      openEventsSidebar();
      cy.findByTestId("dashboard-events-empty-state").should("be.visible");
    });

    it("should not show events on a card visualized another way", () => {
      visitDashboardWithReleaseEvents();
      eventChip(0, "RC1").should("be.visible");

      H.editDashboard();
      H.showDashcardVisualizerModal(0, { isVisualizerCard: false });
      H.selectVisualization("area");
      H.saveDashcardVisualizerModal();
      H.saveDashboard();

      eventChip(0, "RC1").should("not.exist");
      openEventsSidebar();
      cy.findByTestId("dashboard-events-empty-state").should("be.visible");
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
        visitDashboardWithCopies(timeline.id);
      });
      H.waitForDashcardsToLoad({ count: 2 });
      eventChip(0, "RC1").should("be.visible");
      eventChip(1, "RC1").should("be.visible");
      expectEventsShownOnce();

      openEventsSidebar();
      expectDashboardEvent({
        event: "dashboard_events_panel_opened",
        triggered_from: "dashboard_menu",
      });
      toggleEventVisibility("RC1");
      eventChip(0, "RC1").should("not.exist");
      eventChip(1, "RC1").should("not.exist");
      expectDashboardEvent({
        event: "dashboard_events_visibility_changed",
        triggered_from: "dashboard",
        event_detail: "hidden",
      });
      toggleEventVisibility("RC1");
      eventChip(0, "RC1").should("be.visible");
      eventChip(1, "RC1").should("be.visible");
      expectDashboardEvent({
        event: "dashboard_events_visibility_changed",
        triggered_from: "dashboard",
        event_detail: "shown",
      });
      expectEventsShownOnce();

      eventsSidebar().button("Create event").click();
      createEvent("RC2", "01/15/2028");
      eventChip(0, "RC2").should("be.visible");
      eventChip(1, "RC2").should("be.visible");
      H.expectUnstructuredSnowplowEvent({
        event: "new_event_created",
        source: "dashboard",
      });
      expectEventsShownOnce();

      cy.reload();
      H.waitForDashcardsToLoad({ count: 2 });
      eventChip(0, "RC1").should("be.visible");
      eventChip(1, "RC1").should("be.visible");
      cy.get<DashboardId>("@dashboardId").then((dashboardId) => {
        H.expectUnstructuredSnowplowEvent(
          { event: "dashboard_events_shown", target_id: dashboardId },
          2,
        );
      });
    });
  });
});

function visitDashboardWithTimeSeries(
  visualizationSettings: VisualizationSettings = {},
) {
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

function visitDashboardWithMetricAndModel() {
  return createReleaseTimeline().then(({ timeline }) =>
    H.createQuestion({
      ...questionDetails,
      name: "Orders metric",
      type: "metric",
      visualization_settings: {
        "timeline.selected_timeline_ids": [timeline.id],
      },
    }).then(({ body: metric }) =>
      H.createQuestion({
        ...questionDetails,
        name: "Orders model",
        type: "model",
        visualization_settings: {
          "timeline.selected_timeline_ids": [timeline.id],
        },
      }).then(({ body: model }) =>
        // Converting a question to a model forces its display to table, so restore the time-series display.
        cy
          .request("PUT", `/api/card/${model.id}`, { display: "line" })
          .then(({ body: model }) =>
            H.createDashboardWithTabs({
              dashcards: [metric, model].map((card, index) =>
                createMockDashboardCard({
                  id: -(index + 1),
                  card_id: card.id,
                  row: index * 6,
                  size_x: 12,
                  size_y: 6,
                }),
              ),
            }).then((dashboard) => H.visitDashboard(dashboard.id)),
          ),
      ),
    ),
  );
}

function createTimelineQuestion({
  timeline,
  events,
  ...questionOverrides
}: {
  timeline: CreateTimelineRequest;
  events: Omit<TimelineEventDetails, "timeline_id">[];
} & Partial<StructuredQuestionDetails>) {
  return H.createTimelineWithEvents({ timeline, events }).then(({ timeline }) =>
    H.createQuestion({
      ...questionDetails,
      ...questionOverrides,
      visualization_settings: {
        "timeline.selected_timeline_ids": [timeline.id],
      },
    }),
  );
}

function visitDashboardWithReleaseEvents() {
  return createReleaseTimeline().then(({ timeline }) =>
    visitDashboardWithTimeSeries({
      "timeline.selected_timeline_ids": [timeline.id],
    }),
  );
}

// the question's own range stops before the event; only its series reaches it
function visitDashboardWithSeriesReachingTheEvent() {
  return createReleaseTimeline().then(({ timeline }) =>
    H.createQuestion(questionDetails).then(({ body: series }) =>
      H.createQuestionAndDashboard({
        questionDetails: {
          ...questionDetails,
          name: "Orders before the release",
          query: {
            ...questionDetails.query,
            filter: ["<", ["field", ORDERS.CREATED_AT, null], "2027-01-01"],
          },
          visualization_settings: {
            "timeline.selected_timeline_ids": [timeline.id],
          },
        },
        cardDetails: { series: [series] },
      }).then(({ body: { dashboard_id } }) => H.visitDashboard(dashboard_id)),
    ),
  );
}

function visitQuestionWithReleaseEvents() {
  return createReleaseTimeline().then(({ timeline }) =>
    H.createQuestionAndDashboard({
      questionDetails: {
        ...questionDetails,
        visualization_settings: {
          "timeline.selected_timeline_ids": [timeline.id],
        },
      },
    }).then(({ body: { card_id, dashboard_id } }) => {
      cy.wrap(dashboard_id).as("dashboardId");
      cy.wrap(card_id).as("questionId");
      H.visitQuestion("@questionId");
    }),
  );
}

function createReleaseTimeline() {
  return H.createTimelineWithEvents({
    timeline: { name: "Releases" },
    events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
  });
}

function visitDashboardWithCopies(
  timelineId: TimelineId,
  {
    withTabs = false,
    extraDashcards = [],
  }: { withTabs?: boolean; extraDashcards?: DashboardCard[] } = {},
) {
  H.createQuestion({
    ...questionDetails,
    visualization_settings: { "timeline.selected_timeline_ids": [timelineId] },
  }).then(({ body: question }) => {
    H.createDashboardWithTabs({
      tabs: withTabs
        ? [
            { id: -1, name: "Overview" },
            { id: -2, name: "History" },
          ]
        : [],
      dashcards: [
        ...Array.from({ length: withTabs ? 3 : 2 }, (_, index) =>
          createMockDashboardCard({
            id: -(index + 1),
            card_id: question.id,
            dashboard_tab_id: withTabs ? (index === 2 ? -2 : -1) : null,
            row: 0,
            col: index === 1 ? 12 : 0,
            size_x: 12,
            size_y: 6,
          }),
        ),
        ...extraDashcards,
      ],
    }).then((dashboard) => {
      cy.wrap(dashboard.id).as("dashboardId");
      H.visitDashboard(dashboard.id);
    });
  });
}

function denyCollection(id: CollectionId): CollectionPermissions {
  const none: CollectionPermission = "none";
  const denied = { [id]: none };
  return {
    [ALL_USERS_GROUP]: denied,
    [COLLECTION_GROUP]: denied,
    [DATA_GROUP]: denied,
  };
}

function eventChip(cardIndex: number, eventName: string) {
  return H.getDashboardCard(cardIndex).findByRole("button", {
    name: eventName,
  });
}

function openDashCardMenu(cardIndex: number) {
  H.getDashboardCard(cardIndex).realHover({ position: "topLeft" });
  H.getDashboardCardMenu(cardIndex).click();
}

function closeEventsSidebar() {
  eventsSidebar().findByLabelText("Close").click();
}

function expectEventsShownOnce() {
  expectDashboardEvent({ event: "dashboard_events_shown" }, 1);
}

function expectDashboardEvent(
  payload: Record<string, unknown>,
  count?: number,
) {
  cy.get<DashboardId>("@dashboardId").then((dashboardId) => {
    H.expectUnstructuredSnowplowEvent(
      { ...payload, target_id: dashboardId },
      count,
    );
  });
}

function toggleEventVisibility(eventName: string) {
  eventsSidebar().within(() => H.toggleTimelineEventVisibility(eventName));
}

function openEventsSidebar() {
  H.openDashboardMenu("Events");
  eventsSidebar().should("be.visible");
}

function eventsSidebar() {
  return cy.findByTestId("dashboard-events-sidebar");
}

function createEvent(name: string, date: string) {
  H.modal().within(() => {
    cy.findByLabelText("Event name").type(name);
    cy.findByLabelText("Date").clear().type(date);
    cy.button("Create").click();
  });
  cy.wait("@createEvent");
  H.modal().should("not.exist");
  H.waitForTimelinesAfterCreatingAnEvent(name);
}
