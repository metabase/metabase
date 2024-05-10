import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import {
  createQuestion,
  echartsContainer,
  enterCustomColumnDetails,
  getNotebookStep,
  modal,
  openNotebook,
  popover,
  restore,
  startNewQuestion,
  visitQuestion,
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > offset", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("saveQuestion");
    cy.intercept("POST", "api/dataset").as("dataset");
  });

  it("works after saving a question (metabase#42323)", () => {
    const aggregationName = "Total sum with offset";
    const breakoutName = "Created At";

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Raw Data").click();
      cy.findByText("Orders").click();
    });
    addCustomAggregation({
      formula: "Offset(Sum([Total]), -1)",
      name: aggregationName,
    });
    addBreakout(breakoutName);

    visualize();
    verifyLineChart({ xAxis: breakoutName, yAxis: aggregationName });

    saveQuestion().then(({ response }) => {
      visitQuestion(response?.body.id);
      verifyLineChart({ xAxis: breakoutName, yAxis: aggregationName });
    });
  });

  it("should allow using OFFSET as a CASE argument (metabase#42377)", () => {
    const formula = "Sum(case([Total] > 0, Offset([Total], -1)))";
    const name = "Aggregation";
    const questionDetails: StructuredQuestionDetails = {
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };
    createQuestion(questionDetails, { visitQuestion: true });
    openNotebook();
    cy.icon("sum").click();
    addCustomAggregation({ formula, name });

    cy.on("uncaught:exception", error => {
      expect(error.message.includes("Error normalizing")).not.to.be.true;
    });
  });
});

function addCustomAggregation({
  formula,
  name,
}: {
  formula: string;
  name: string;
}) {
  getNotebookStep("summarize")
    .findByText("Pick the metric you want to see")
    .click();
  popover().contains("Custom Expression").click();
  enterCustomColumnDetails({ formula, name });
  popover().button("Done").click();
}

function addBreakout(name: string) {
  getNotebookStep("summarize").findByText("Pick a column to group by").click();
  popover().findByText(name).click();
}

function saveQuestion() {
  cy.button("Save").click();
  modal().button("Save").click();
  return cy.wait("@saveQuestion");
}

function verifyLineChart({ xAxis, yAxis }: { xAxis: string; yAxis: string }) {
  echartsContainer().within(() => {
    cy.findByText(yAxis).should("be.visible");
    cy.findByText(xAxis).should("be.visible");
  });
}
