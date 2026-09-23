const { H } = cy;

import { ADMIN_PERSONAL_COLLECTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { CardId, DashboardId, TimelineId } from "metabase-types/api";

import {
  TIME_SERIES_QUESTION,
  createQuestionAndDashboardWithEvents,
  expectChartWithoutEvents,
  expectReadOnlyDashboardEvents,
  interceptTimelineRequests,
} from "./shared/timeline-events";

describe("scenarios > organization > timelines > public links and embeds", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    createQuestionAndDashboardWithEvents();
  });

  it("should not show events on a public question", () => {
    cy.get<CardId>("@questionId").then((id) => H.visitPublicQuestion(id));

    expectChartWithoutEvents();
  });

  it("should not show events on a static embedded question", () => {
    cy.get<CardId>("@questionId").then((id) =>
      H.visitEmbeddedPage({ resource: { question: id }, params: {} }),
    );

    expectChartWithoutEvents();
  });

  it("should show only saved events read-only on a public dashboard for anonymous and signed-in viewers, and none once the timeline is archived", () => {
    cy.get<DashboardId>("@dashboardId").then((id) =>
      H.visitPublicDashboard(id),
    );

    expectSharedDashboardEvents();

    cy.log("a signed-in viewer sees the same read-only events");
    cy.signInAsAdmin();
    cy.reload();

    expectSharedDashboardEvents();

    cy.log("archiving the timeline removes its events");
    cy.get<TimelineId>("@timelineId").then((id) =>
      cy.request("PUT", `/api/timeline/${id}`, { archived: true }),
    );
    cy.reload();

    expectChartWithoutEvents();
  });

  it("should open single and grouped chip details with the keyboard on a public dashboard", () => {
    cy.get<DashboardId>("@dashboardId").then((id) =>
      H.visitPublicDashboard(id),
    );

    H.timelineEventChip("RC1")
      .should("be.visible")
      .focus()
      .should("be.focused");

    cy.log("Enter opens the read-only details");
    cy.realPress("Enter");
    cy.findByTestId("timeline-event-popover")
      .should("contain", "RC1")
      .and("contain", "The first release candidate is ready.")
      .and("not.contain", "See all");
    cy.findByTestId("timeline-event-popover")
      .findByRole("checkbox")
      .should("not.exist");
    cy.findByTestId("dashboard-events-sidebar").should("not.exist");

    cy.log("Escape dismisses the details and returns focus to the chip");
    cy.realPress("Escape");
    cy.findByTestId("timeline-event-popover").should("not.exist");
    H.timelineEventChip("RC1").should("be.focused");

    cy.log("hovering still opens the details");
    cy.findByTestId("embed-frame-header").realHover();
    H.timelineEventChip("RC1").realHover();
    cy.findByTestId("timeline-event-popover").should("contain", "RC1");

    cy.log("a grouped chip lists every event in the group");
    // park the pointer away from the chip so nothing hovers it after the reload
    cy.findByTestId("embed-frame-header").realHover();
    cy.findByTestId("timeline-event-popover").should("not.exist");
    cy.signInAsAdmin();
    cy.get<TimelineId>("@timelineId").then((id) =>
      H.createTimelineEvent({
        timeline_id: id,
        name: "RC2",
        description: "The second release candidate is ready.",
        timestamp: "2027-10-20T00:00:00Z",
      }),
    );
    cy.reload();
    H.timelineEventChip("2 events")
      .should("be.visible")
      .focus()
      .should("be.focused");
    cy.realPress("Enter");
    cy.findByTestId("timeline-event-popover")
      .should("contain", "RC1")
      .and("contain", "RC2")
      .and("not.contain", "Internal release notes")
      .and("not.contain", "See all");
    cy.findByTestId("timeline-event-popover")
      .findByRole("checkbox")
      .should("not.exist");
    cy.findByTestId("dashboard-events-sidebar").should("not.exist");
    cy.realPress("Escape");
    cy.findByTestId("timeline-event-popover").should("not.exist");
    H.timelineEventChip("2 events").should("be.focused");
  });

  it("should show only saved events read-only on a static embedded dashboard", () => {
    cy.get<DashboardId>("@dashboardId").then((id) =>
      H.visitEmbeddedPage({ resource: { dashboard: id }, params: {} }),
    );

    expectSharedDashboardEvents();
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

    cy.log("the admin who owns the timeline sees it through the same surface");
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

  it("should not show events on a public document", () => {
    cy.get<CardId>("@questionId").then((id) => {
      H.createDocument({
        name: "Document with events",
        document: {
          type: "doc",
          content: [
            {
              type: "resizeNode",
              attrs: { height: 400, minHeight: 280 },
              content: [
                { type: "cardEmbed", attrs: { id, name: null, _id: "1" } },
              ],
            },
          ],
        },
        idAlias: "documentId",
      });
    });
    H.visitPublicDocument("@documentId");

    expectChartWithoutEvents();
  });

  it("should not show events in a question embed preview", () => {
    H.visitQuestion("@questionId");
    H.timelineEventChip("RC1").should("be.visible");

    interceptTimelineRequests("previewTimelineRequests");
    cy.intercept("GET", "/api/preview_embed/card/*/query*").as("previewQuery");
    cy.get<CardId>("@questionId").then((id) => {
      H.openLegacyStaticEmbeddingModal({
        resource: "question",
        resourceId: id,
        activeTab: "parameters",
        previewMode: "preview",
        unpublishBeforeOpen: false,
      });
    });

    cy.wait("@previewQuery");
    H.getIframeBody().within(() => {
      expectChartWithoutEvents({ requestAlias: "previewTimelineRequests" });
    });
  });

  it("should show only saved events read-only in a dashboard embed preview", () => {
    H.visitDashboard("@dashboardId");
    H.timelineEventChip("RC1").should("be.visible");

    interceptTimelineRequests("previewTimelineRequests");
    cy.intercept("GET", "/api/preview_embed/dashboard/*/dashcard/*/card/*").as(
      "previewQuery",
    );
    cy.get<DashboardId>("@dashboardId").then((id) => {
      H.openLegacyStaticEmbeddingModal({
        resource: "dashboard",
        resourceId: id,
        activeTab: "parameters",
        previewMode: "preview",
        unpublishBeforeOpen: false,
      });
    });

    cy.wait("@previewQuery");
    // the preview iframe reloads on interaction, so only assert what is rendered
    H.getIframeBody().within(() => {
      H.echartsContainer().findByText("Created At: Month").should("be.visible");
      cy.findAllByTestId("timeline-event-chip").should("have.length", 1);
      H.timelineEventChip("RC1").should("be.visible");
      cy.findByTestId("dashboard-events-sidebar").should("not.exist");
      cy.findByRole("button", { name: "Events", exact: true }).should(
        "not.exist",
      );
    });
    cy.get("@previewTimelineRequests.all").should("have.length", 0);
  });
});

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
