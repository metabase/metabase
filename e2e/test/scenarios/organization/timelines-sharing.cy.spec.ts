const { H } = cy;

import type { Dashboard } from "metabase-types/api";

import {
  createQuestionAndDashboardWithEvents,
  expectChartWithoutEvents,
  expectReadOnlyDashboardEvents,
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

  it("should show only saved events read-only on a public dashboard for anonymous and signed-in viewers", () => {
    cy.intercept("GET", "/api/public/dashboard/*").as("getSharedDashboard");
    cy.get<number>("@dashboardId").then((id) => H.visitPublicDashboard(id));

    expectSharedDashboardEvents();

    cy.signInAsAdmin();
    cy.reload();

    expectSharedDashboardEvents();
  });

  it("should show only saved events read-only on a static embedded dashboard", () => {
    cy.intercept("GET", "/api/embed/dashboard/*").as("getSharedDashboard");
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
});

function expectSharedDashboardEvents() {
  cy.wait<unknown, Dashboard>("@getSharedDashboard").then(({ response }) => {
    expect(response?.statusCode).to.equal(200);
    const events = response?.body.dashcards.flatMap(
      ({ timeline_events = [] }) => timeline_events,
    );
    expect(events?.map(({ name }) => name)).to.deep.equal(["RC1"]);
    events?.forEach((event) => {
      // we need to be sure no creator data is leaked
      expect(Object.keys(event).sort()).to.deep.equal([
        "archived",
        "created_at",
        "description",
        "icon",
        "id",
        "name",
        "time_matters",
        "timeline_id",
        "timestamp",
        "timezone",
      ]);
    });
  });
  expectReadOnlyDashboardEvents();
  cy.get("@getTimelines.all").should("have.length", 0);
}
