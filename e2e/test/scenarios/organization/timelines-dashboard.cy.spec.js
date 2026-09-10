const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import { createMockDashboardCard } from "metabase-types/api/mocks";

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
    }).then(({ timeline: privateTimeline }) => {
      createReleaseTimeline().then(({ timeline }) => {
        H.createQuestionAndDashboard({
          questionDetails: {
            ...questionDetails,
            visualization_settings: {
              "timeline.selected_timeline_ids": [
                timeline.id,
                privateTimeline.id,
              ],
            },
          },
        }).then(({ body: { dashboard_id } }) => {
          cy.signOut();
          cy.signIn("readonly");
          H.visitDashboard(dashboard_id);
        });
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
    }).then(({ timeline }) => {
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
      }).then(({ body: dashcard, questionId }) => {
        cy.request("PUT", `/api/dashboard/${dashcard.dashboard_id}`, {
          dashcards: [
            {
              ...dashcard,
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
          ],
        });
        H.visitDashboard(dashcard.dashboard_id);
      });
    });
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

  it("should hide events below the minimum chart size and restore them after enlarging the card", () => {
    createReleaseTimeline().then(({ timeline }) => {
      visitDashboardWithTimeSeries({
        "timeline.selected_timeline_ids": [timeline.id],
      });
    });
    H.timelineEventChip("RC1").should("be.visible");
    H.editDashboard();
    H.resizeDashboardCard({ card: H.getDashboardCard(), x: -2000, y: -2000 });
    H.saveDashboard();
    H.getDashboardCard()
      .findByTestId("chart-container")
      .should("be.visible")
      .and(($chart) => {
        const { width, height } = $chart[0].getBoundingClientRect();
        expect(
          width < 240 || height < 200,
          "chart is below the supported event size",
        ).to.be.true;
      });
    H.timelineEventChip("RC1").should("not.exist");
    H.getDashboardCardMenu().click();
    H.menu().should("be.visible").findByText("Events").should("not.exist");
    cy.realPress("Escape");
    H.menu().should("not.exist");

    H.editDashboard();
    H.resizeDashboardCard({ card: H.getDashboardCard(), x: 900, y: 700 });
    H.saveDashboard();
    H.getDashboardCard().findByText("Created At: Month").should("be.visible");
    H.timelineEventChip("RC1").should("be.visible");
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
      cy.get("@dashboardId").then((dashboardId) => {
        H.expectUnstructuredSnowplowEvent(
          { event: "dashboard_events_shown", target_id: dashboardId },
          2,
        );
      });
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

function createReleaseTimeline() {
  return H.createTimelineWithEvents({
    timeline: { name: "Releases" },
    events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
  });
}

function visitDashboardWithCopies(
  timelineId,
  { withTabs = false, extraDashcards = [] } = {},
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

function eventChip(cardIndex, eventName) {
  return H.getDashboardCard(cardIndex).findByRole("button", {
    name: eventName,
    exact: true,
  });
}

function closeEventsSidebar() {
  eventsSidebar().findByLabelText("Close").click();
}

function expectEventsShownOnce() {
  expectDashboardEvent({ event: "dashboard_events_shown" }, 1);
}

function expectDashboardEvent(payload, count) {
  cy.get("@dashboardId").then((dashboardId) => {
    H.expectUnstructuredSnowplowEvent(
      { ...payload, target_id: dashboardId },
      count,
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
    cy.findByLabelText("Date").clear().type(date);
    cy.button("Create").click();
  });
  cy.wait("@createEvent");
  H.modal().should("not.exist");
  H.waitForTimelinesAfterCreatingAnEvent(name);
}
