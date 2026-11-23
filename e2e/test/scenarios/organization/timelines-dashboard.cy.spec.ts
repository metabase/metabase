const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import type {
  CollectionId,
  CollectionPermission,
  CollectionPermissions,
  DashboardId,
  TimelineId,
  VisualizationSettings,
} from "metabase-types/api";
import { createMockDashboardCard } from "metabase-types/api/mocks";

import {
  TIME_SERIES_QUESTION,
  createQuestionAndDashboardWithEvents,
  expectChartWithoutEvents,
  expectReadOnlyDashboardEvents,
} from "./shared/timeline-events";

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

    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.findByTestId("dashboard-name-heading").type(" renamed").blur();
    cy.wait("@getDashboard");
    eventChip(1, "RC1").should("be.visible");
    eventsSidebar().within(() => {
      H.timelineEventVisibility("RC1").should("not.be.checked");
    });
    eventChip(0, "RC1").should("not.exist");

    cy.reload();
    H.waitForDashcardsToLoad({ count: 2 });
    eventChip(0, "RC1").should("be.visible");
    eventChip(1, "RC1").should("be.visible");
    eventsSidebar().should("not.exist");
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

  it("should bring a card's events back on the dashboard when its question is reverted", () => {
    cy.intercept("POST", "/api/revision/revert").as("revertRevision");

    createReleaseTimeline().then(({ timeline }) =>
      H.createQuestionAndDashboard({
        questionDetails: {
          ...questionDetails,
          visualization_settings: {
            "timeline.selected_timeline_ids": [timeline.id],
          },
        },
      }).then(({ body: { card_id, dashboard_id } }) => {
        cy.wrap(card_id).as("questionId");
        cy.wrap(dashboard_id).as("dashboardId");
      }),
    );

    cy.get<DashboardId>("@dashboardId").then(H.visitDashboard);
    eventChip(0, "RC1").should("be.visible");

    cy.log("hide the event on the question, which the dashboard follows");
    H.visitQuestion("@questionId");
    cy.findByTestId("view-footer").icon("calendar").click();
    H.rightSidebar().within(() => H.toggleTimelineEventVisibility("RC1"));
    H.saveSavedQuestion();

    cy.get<DashboardId>("@dashboardId").then(H.visitDashboard);
    eventChip(0, "RC1").should("not.exist");

    cy.log("reverting the question restores what the dashboard shows");
    H.visitQuestion("@questionId");
    H.questionInfoButton().click();
    H.sidesheet().within(() => {
      cy.findByRole("tab", { name: "History" }).click();
      cy.findAllByTestId("question-revert-button").first().click();
    });
    cy.wait("@revertRevision").its("response.statusCode").should("eq", 200);

    cy.get<DashboardId>("@dashboardId").then(H.visitDashboard);
    eventChip(0, "RC1").should("be.visible");
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

  describe("public links and embeds", () => {
    beforeEach(() => {
      createQuestionAndDashboardWithEvents();
    });

    it("should show only saved events read-only on a public dashboard for anonymous and signed-in viewers and on a static embed, and none once the timeline is archived", () => {
      cy.get<DashboardId>("@dashboardId").then((id) =>
        H.visitPublicDashboard(id),
      );

      expectSharedDashboardEvents();

      cy.log("a signed-in viewer sees the same read-only events");
      cy.signInAsAdmin();
      cy.reload();

      expectSharedDashboardEvents();

      cy.log("a static embed of the same dashboard shows the same events");
      cy.get<DashboardId>("@dashboardId").then((id) =>
        H.visitEmbeddedPage({ resource: { dashboard: id }, params: {} }),
      );

      expectSharedDashboardEvents();

      cy.log("archiving the timeline removes its events");
      cy.signInAsAdmin();
      cy.get<TimelineId>("@timelineId").then((id) =>
        cy.request("PUT", `/api/timeline/${id}`, { archived: true }),
      );
      cy.get<DashboardId>("@dashboardId").then((id) =>
        H.visitPublicDashboard(id),
      );

      expectChartWithoutEvents();
    });

    it("should show saved events read-only on an interactively embedded dashboard but keep the events panel on the question", () => {
      // without the token this runs in plain-app mode and asserts the wrong surface
      H.activateToken("pro-self-hosted");
      cy.get<DashboardId>("@dashboardId").then((id) =>
        H.visitFullAppEmbeddingUrl({ url: `/dashboard/${id}`, qs: {} }),
      );

      expectReadOnlyDashboardEvents();
      expectDashCardMenuWithoutEvents();
      H.openDashboardMenu();
      H.popover()
        .should("contain", "Enter fullscreen")
        .and("not.contain", "Events");
      cy.realPress("Escape");

      H.getDashboardCard().findByText("Orders by month").click();

      H.timelineEventChip("RC1").should("be.visible");
      cy.findByTestId("view-footer").icon("calendar").click();
      H.rightSidebar()
        .should("contain", "Create event")
        .and("contain", "Releases");
    });

    it("should not show events of a timeline the viewer cannot read in interactive embedding", () => {
      H.activateToken("pro-self-hosted");
      createDashboardWithPrivateTimeline();

      cy.log(
        "the admin who owns the timeline sees it through the same surface",
      );
      cy.get<DashboardId>("@privateDashboardId").then((id) =>
        H.visitFullAppEmbeddingUrl({ url: `/dashboard/${id}`, qs: {} }),
      );
      H.timelineEventChip("Secret release").should("be.visible");

      cy.signOut();
      cy.signIn("readonly");
      cy.get<DashboardId>("@privateDashboardId").then((id) =>
        H.visitFullAppEmbeddingUrl({ url: `/dashboard/${id}`, qs: {} }),
      );

      H.echartsContainer().findByText("Created At: Month").should("be.visible");
      H.timelineEventChip("Secret release").should("not.exist");
    });

    it("should show events of a timeline the viewer cannot read on a public dashboard", () => {
      createDashboardWithPrivateTimeline();

      cy.get<DashboardId>("@privateDashboardId").then((id) =>
        H.visitPublicDashboard(id),
      );
      H.timelineEventChip("Secret release").should("be.visible");

      cy.log("and to a signed-in viewer without access to the collection");
      cy.signIn("readonly");
      cy.reload();
      H.timelineEventChip("Secret release").should("be.visible");
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

function createReleaseTimeline() {
  return H.createTimelineWithEvents({
    timeline: { name: "Releases" },
    events: [{ name: "RC1", timestamp: "2027-10-20T00:00:00Z" }],
  });
}

function visitDashboardWithCopies(timelineId: TimelineId) {
  H.createQuestion({
    ...questionDetails,
    visualization_settings: { "timeline.selected_timeline_ids": [timelineId] },
  }).then(({ body: question }) => {
    H.createDashboardWithTabs({
      tabs: [],
      dashcards: [0, 1].map((index) =>
        createMockDashboardCard({
          id: -(index + 1),
          card_id: question.id,
          dashboard_tab_id: null,
          row: 0,
          col: index * 12,
          size_x: 12,
          size_y: 6,
        }),
      ),
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

function expectSharedDashboardEvents() {
  expectReadOnlyDashboardEvents();
  expectDashCardMenuWithoutEvents();
  cy.get("@getTimelines.all").should("have.length", 0);
}

function expectDashCardMenuWithoutEvents() {
  H.getDashboardCard().realHover();
  H.getDashboardCard().findByRole("button", { name: "More options" }).click();
  H.menu().should("be.visible").findByText("Events").should("not.exist");
  cy.realPress("Escape");
}

function createDashboardWithPrivateTimeline() {
  return H.createTimelineWithEvents({
    timeline: {
      name: "Private launches",
      collection_id: ADMIN_PERSONAL_COLLECTION_ID,
    },
    events: [{ name: "Secret release", timestamp: "2027-10-20T00:00:00Z" }],
  }).then(({ timeline }) =>
    H.createQuestionAndDashboard({
      questionDetails: {
        ...TIME_SERIES_QUESTION,
        name: "Orders by month, privately",
        visualization_settings: {
          "timeline.selected_timeline_ids": [timeline.id],
        },
      },
      dashboardDetails: {
        name: "Dashboard with a private timeline",
        enable_embedding: true,
      },
    }).then(({ body: { dashboard_id } }) =>
      cy.wrap(dashboard_id).as("privateDashboardId"),
    ),
  );
}
