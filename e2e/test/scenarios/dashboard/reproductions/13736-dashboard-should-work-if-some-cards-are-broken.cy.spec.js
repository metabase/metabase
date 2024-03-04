import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  getDashboardCards,
  restore,
  updateDashboardCards,
  visitDashboard,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
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
    cy.createQuestion(questionDetails, {
      wrapId: true,
      idAlias: "failingQuestionId",
    });
    cy.createQuestion(questionDetails, {
      wrapId: true,
      idAlias: "successfulQuestionId",
    });
    cy.createDashboard({ name: "13736 Dashboard" }).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("dashboardId");
      },
    );

    cy.then(function () {
      const dashboardId = this.dashboardId;
      const failingQuestionId = this.failingQuestionId;
      const successfulQuestionId = this.successfulQuestionId;

      cy.intercept(
        "POST",
        `/api/dashboard/*/dashcard/*/card/${failingQuestionId}/query`,
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
            card_id: failingQuestionId,
          },
          {
            card_id: successfulQuestionId,
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
