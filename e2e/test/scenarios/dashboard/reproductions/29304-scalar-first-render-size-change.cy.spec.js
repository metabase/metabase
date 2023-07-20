import { restore, visitDashboard } from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const SCALAR_QUESTION = {
  name: "Scalar question",
  // description: "This is a rather lengthy question description",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const SCALAR_QUESTION_CARD = { size_x: 16, size_y: 10, row: 0, col: 0 };

const SMART_SCALAR_QUESTION = {
  name: "Smart scalar question",
  // description: "This is a rather lengthy question description",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        {
          "base-type": "type/DateTime",
          "temporal-unit": "month",
        },
      ],
    ],
  },
  display: "smartscalar",
};

const SMART_SCALAR_QUESTION_CARD = SCALAR_QUESTION_CARD;

describe("issue 29304", () => {
  describe("display: scalar", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should render scalar without multiple sizes (metabase#31628)", () => {
      // cy.clock();
      cy.createDashboard().then(({ body: dashboard }) => {
        cy.createQuestionAndAddToDashboard(
          SCALAR_QUESTION,
          dashboard.id,
          SCALAR_QUESTION_CARD,
        );

        visitDashboard(dashboard.id);
      });
    });

    it("should render smart scalar without multiple sizes (metabase#31628)", () => {
      // cy.clock();
      cy.createDashboard().then(({ body: dashboard }) => {
        cy.createQuestionAndAddToDashboard(
          SMART_SCALAR_QUESTION,
          dashboard.id,
          SMART_SCALAR_QUESTION_CARD,
        );

        visitDashboard(dashboard.id);
      });
    });
  });
});
