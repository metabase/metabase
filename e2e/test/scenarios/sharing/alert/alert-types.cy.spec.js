const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const multiSeriesQuestionWithGoal = {
  name: "multi",
  query: {
    "source-table": PEOPLE_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", PEOPLE.SOURCE, null],
      [
        "field",
        PEOPLE.CREATED_AT,
        {
          "temporal-unit": "month",
        },
      ],
    ],
  },
  display: "line",
};

const timeSeriesQuestionId = ORDERS_BY_YEAR_QUESTION_ID;

const rawTestCases = [
  {
    questionType: "raw data question",
    questionId: ORDERS_QUESTION_ID,
  },
  {
    questionType: "timeseries question without a goal",
    questionId: timeSeriesQuestionId,
  },
];

describe("scenarios > alert > types", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/notification").as("updateAlert");
    cy.intercept("GET", "/api/channel").as("channel");

    H.restore();
    cy.signInAsAdmin();

    H.setupSMTP();
  });

  describe("rows based alerts", () => {
    rawTestCases.forEach(({ questionType, questionId }) => {
      it(`should be supported for ${questionType}`, () => {
        H.visitQuestion(questionId);

        H.openSharingMenu("Create an alert");
        cy.wait("@channel");

        H.modal().within(() => {
          cy.findByText("New alert").should("be.visible");

          cy.findByTestId("alert-goal-select")
            .should("not.be.enabled")
            .should("have.text", "When this question has results");

          cy.findByText("Done").click();
        });

        cy.wait("@updateAlert").then(({ response: { body } }) => {
          expect(body.payload?.send_condition).to.equal("has_result");
        });
      });
    });
  });

  describe("goal based alerts", () => {
    it("should work for timeseries questions with a set goal", () => {
      cy.request("PUT", `/api/card/${timeSeriesQuestionId}`, {
        visualization_settings: {
          "graph.show_goal": true,
          "graph.goal_value": 7000,
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["count"],
        },
      });

      cy.log("Set the goal on timeseries question");
      H.visitQuestion(timeSeriesQuestionId);
      cy.findByTestId("chart-container").should("contain", "Goal");

      H.openSharingMenu("Create an alert");
      cy.wait("@channel");

      H.modal().findByTestId("alert-goal-select").should("be.enabled").click();

      H.popover().within(() => {
        cy.findByText("When results go above the goal line").should(
          "be.visible",
        );
        cy.findByText("When results go below the goal line").should(
          "be.visible",
        );

        cy.findByText("When results go above the goal line").click();
      });

      H.modal().within(() => {
        cy.findByText("Only send this alert once").click();

        cy.button("Done").click();
      });

      cy.log("Check the API response");
      cy.wait("@updateAlert").then(({ response: { body } }) => {
        expect(body.payload?.send_condition).to.equal("goal_above");
        expect(body.payload?.send_once).to.equal(true);
      });
    });

    it("should not be possible to create goal based alert for a multi-series question", () => {
      H.createQuestion(multiSeriesQuestionWithGoal, { visitQuestion: true });

      H.openSharingMenu("Create an alert");
      cy.wait("@channel");

      H.modal().within(() => {
        cy.findByText("New alert").should("be.visible");

        cy.findByTestId("alert-goal-select")
          .should("not.be.enabled")
          .should("have.text", "When this question has results");

        cy.findByText("Done").click();
      });

      // The alert condition should fall back to rows
      cy.wait("@updateAlert").then(({ response: { body } }) => {
        expect(body.payload?.send_condition).to.equal("has_result");
      });
    });
  });
});
