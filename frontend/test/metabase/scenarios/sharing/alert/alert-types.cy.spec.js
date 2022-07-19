import { restore, setupSMTP, visitQuestion } from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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

const timeSeriesQuestionId = 3;

const rawTestCases = [
  {
    questionType: "raw data question",
    questionId: 1,
  },
  {
    questionType: "timeseries question without a goal",
    questionId: timeSeriesQuestionId,
  },
];

describe("scenarios > alert > types", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/alert").as("savedAlert");

    restore();
    cy.signInAsAdmin();

    setupSMTP();
  });

  describe("rows based alerts", () => {
    rawTestCases.forEach(({ questionType, questionId }) => {
      it(`should be supported for ${questionType}`, () => {
        visitQuestion(questionId);

        openAlertModal();

        cy.findByText("Done").click();

        cy.wait("@savedAlert").then(({ response: { body } }) => {
          expect(body.alert_condition).to.equal("rows");
        });
      });
    });
  });

  describe("goal based alerts", () => {
    it("should work for timeseries questions with a set goal", () => {
      // Set goal on timeseries question
      visitQuestion(timeSeriesQuestionId);

      cy.findByText("Settings").click();
      cy.findByText("Line options");

      setGoal("7000");

      // Save question
      cy.findByText("Save").click();
      cy.get(".Modal").button("Save").click();
      cy.findByText("Save question").should("not.exist");

      openAlertModal();

      cy.findByText("Reaches the goal line").click();
      cy.findByText("The first time").click();

      cy.button("Done").click();

      // Check the API response
      cy.wait("@savedAlert").then(({ response: { body } }) => {
        expect(body.alert_condition).to.equal("goal");
        expect(body.alert_above_goal).to.equal(true);
        expect(body.alert_first_only).to.equal(true);
      });
    });

    it("should not be possible to create goal based alert for a multi-series question", () => {
      cy.createQuestion(multiSeriesQuestionWithGoal, { visitQuestion: true });

      openAlertModal();

      // *** The warning below is not showing when we try to make an alert (Issue #???)
      // cy.contains(
      //   "Goal-based alerts aren't yet supported for charts with more than one line",
      // );

      cy.findByText("Done").click();

      // The alert condition should fall back to rows
      cy.wait("@savedAlert").then(({ response: { body } }) => {
        expect(body.alert_condition).to.equal("rows");
        expect(body.alert_above_goal).to.equal(null);
      });
    });
  });
});

function openAlertModal() {
  cy.icon("bell").click();
  cy.findByText("Set up an alert").click();
}

function setGoal(goal) {
  // Enable the toggle
  cy.findByText("Goal line").next().click();

  cy.findByDisplayValue("0").clear().type(goal);

  cy.button("Done").click();
}
