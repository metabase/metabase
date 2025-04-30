import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > entity id", () => {
  beforeEach(() => {
    H.prepareSdkIframeEmbedTest();
    H.getEntityIdFromResource("dashboard", ORDERS_DASHBOARD_ID).as(
      "dashboardEntityId",
    );
    H.getEntityIdFromResource("question", ORDERS_QUESTION_ID).as(
      "questionEntityId",
    );
    cy.signOut();
  });

  it("loads dashboard using entity id", () => {
    cy.get<string>("@dashboardEntityId").then((dashboardId) => {
      const frame = H.loadSdkIframeEmbedTestPage({ dashboardId });

      cy.wait("@getDashCardQuery");

      frame.within(() => {
        cy.findByText("Orders in a dashboard").should("be.visible");
        cy.findByText("Orders").should("be.visible");
        H.assertTableRowsCount(2000);
      });
    });
  });

  it("loads question using entity id", () => {
    cy.get<string>("@questionEntityId").then((questionId) => {
      const frame = H.loadSdkIframeEmbedTestPage({ questionId });

      cy.wait("@getCardQuery");

      frame.within(() => {
        H.assertSdkInteractiveQuestionOrdersUsable();
      });
    });
  });
});
