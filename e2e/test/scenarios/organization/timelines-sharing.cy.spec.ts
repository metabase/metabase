const { H } = cy;

import {
  createQuestionAndDashboardWithEvents,
  expectChartWithoutEvents,
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

  it("should not show events on a public dashboard", () => {
    cy.get<number>("@dashboardId").then((id) => H.visitPublicDashboard(id));

    expectChartWithoutEvents();
  });

  it("should not show events on a static embedded dashboard", () => {
    cy.get<number>("@dashboardId").then((id) =>
      H.visitEmbeddedPage({ resource: { dashboard: id }, params: {} }),
    );

    expectChartWithoutEvents();
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
