const { H } = cy;

import {
  STEP_COLUMN_CARD,
  VIEWS_COLUMN_CARD,
} from "e2e/support/test-visualizer-data";

describe("scenarios > visualizer > funnels", () => {
  beforeEach(() => {
    H.restore();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.signInAsNormalUser();
  });

  it("should build a funnel, save it on a dashboard and open its questions from the title", () => {
    H.createNativeQuestion(STEP_COLUMN_CARD);
    H.createNativeQuestion(VIEWS_COLUMN_CARD).then(
      ({ body: { id: viewsQuestionId } }) => {
        cy.wrap(viewsQuestionId).as("viewsQuestionId");
      },
    );

    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);
    });
    H.editDashboard();

    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(STEP_COLUMN_CARD.name);

    H.modal().within(() => {
      H.selectVisualization("funnel");

      H.switchToAddMoreData();
      H.selectDataset(VIEWS_COLUMN_CARD.name);
      H.switchToColumnsList();

      H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step");
      H.assertDataSourceColumnSelected(VIEWS_COLUMN_CARD.name, "Views");
      H.assertWellItems({
        vertical: ["Views"],
        horizontal: [
          "Step",
          "Landing page",
          "Checkout page",
          "Payment done page",
        ],
      });
    });

    H.saveDashcardVisualizerModal({ mode: "create" });
    H.saveDashboard();

    cy.reload();
    H.getDashboardCard(0).within(() => {
      cy.findByTestId("funnel-chart").should("exist");
      cy.findByText("Landing page").should("exist");
      cy.findByText("Checkout page").should("exist");
      cy.findByText("Payment done page").should("exist");
    });

    H.clickOnCardTitle(0);
    cy.findByTestId("legend-caption-menu")
      .findByText(VIEWS_COLUMN_CARD.name)
      .click();
    cy.get("@viewsQuestionId").then((viewsQuestionId) => {
      cy.location("pathname").should("contain", `/question/${viewsQuestionId}`);
    });
  });
});
