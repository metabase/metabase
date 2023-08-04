import {
  getDashboardCards,
  restore,
  updateDashboardCards,
  visitDashboard,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails1 = {
  name: "Orders question",
  query: { "source-table": ORDERS_ID },
};

const questionDetails2 = {
  name: "Orders count",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

describe("issue 13736", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should work even if some cards are broken (metabase#13736)", () => {
    cy.createQuestion(questionDetails1, {
      wrapId: true,
      idAlias: "questionId1",
    });
    cy.createQuestion(questionDetails2, {
      wrapId: true,
      idAlias: "questionId2",
    });
    cy.createDashboard({ name: "13736 Dashboard" }).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("dashboardId");
      },
    );

    cy.then(function () {
      const dashboardId = this.dashboardId;
      const questionId1 = this.questionId1;
      const questionId2 = this.questionId2;

      cy.intercept(
        "POST",
        `/api/dashboard/*/dashcard/*/card/${questionId1}/query`,
        {
          statusCode: 500,
          body: {
            cause: "some error",
            data: {},
            message: "some error",
          },
        },
      );

      updateDashboardCards({
        dashboard_id: dashboardId,
        cards: [
          {
            card_id: questionId1,
          },
          {
            card_id: questionId2,
            col: 11,
          },
        ],
      });
      visitDashboard(dashboardId);
    });

    getDashboardCards()
      .eq(0)
      .findByText("There was a problem displaying this chart.");

    getDashboardCards().eq(1).findByText("18,760").should("be.visible");
  });
});
