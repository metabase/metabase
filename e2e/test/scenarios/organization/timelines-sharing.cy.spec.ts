const { H } = cy;

import {
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
    cy.get<number>("@questionId").then((id) => H.visitPublicQuestion(id));

    expectChartWithoutEvents();
  });

  it("should not show events on a static embedded question", () => {
    cy.get<number>("@questionId").then((id) =>
      H.visitEmbeddedPage({ resource: { question: id }, params: {} }),
    );

    expectChartWithoutEvents();
  });

  it("should show only saved events read-only on a public dashboard for anonymous and signed-in viewers, and none once the timeline is archived", () => {
    cy.get<number>("@dashboardId").then((id) => H.visitPublicDashboard(id));

    expectSharedDashboardEvents();

    cy.log("a signed-in viewer sees the same read-only events");
    cy.signInAsAdmin();
    cy.reload();

    expectSharedDashboardEvents();

    cy.log("archiving the timeline removes its events");
    cy.get<number>("@timelineId").then((id) =>
      cy.request("PUT", `/api/timeline/${id}`, { archived: true }),
    );
    cy.reload();

    expectChartWithoutEvents();
  });

  it("should show only saved events read-only on a static embedded dashboard", () => {
    cy.get<number>("@dashboardId").then((id) =>
      H.visitEmbeddedPage({ resource: { dashboard: id }, params: {} }),
    );

    expectSharedDashboardEvents();
  });

  it("should not show events on a public document", () => {
    cy.get<number>("@questionId").then((id) => {
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
    cy.get<number>("@questionId").then((id) => {
      H.visitQuestion(id);
      H.timelineEventChip("RC1").should("be.visible");

      interceptTimelineRequests("previewTimelineRequests");
      cy.intercept("GET", "/api/preview_embed/card/*/query*").as(
        "previewQuery",
      );
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
    cy.get<number>("@dashboardId").then((id) => {
      H.visitDashboard(id);
      H.timelineEventChip("RC1").should("be.visible");

      interceptTimelineRequests("previewTimelineRequests");
      cy.intercept(
        "GET",
        "/api/preview_embed/dashboard/*/dashcard/*/card/*",
      ).as("previewQuery");
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
  H.getDashboardCard().realHover();
  H.getDashboardCard().findByRole("button", { name: "More options" }).click();
  H.menu().should("be.visible").findByText("Events").should("not.exist");
  cy.realPress("Escape");
  cy.get("@getTimelines.all").should("have.length", 0);
}
