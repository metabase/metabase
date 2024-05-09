import {
  echartsContainer,
  enterCustomColumnDetails,
  getNotebookStep,
  modal,
  popover,
  restore,
  startNewQuestion,
  visualize,
} from "e2e/support/helpers";

describe("scenarios > question > offset", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("saveQuestion");
    cy.intercept("POST", "api/dataset").as("dataset");
  });

  it("works after saving a question (metabase#42323)", () => {
    const AGGREGATION_NAME = "Total sum with offset";
    const BREAKOUT_NAME = "Created At";

    startNewQuestion();
    popover().within(() => {
      cy.findByText("Raw Data").click();
      cy.findByText("Orders").click();
    });

    getNotebookStep("summarize")
      .findByText("Pick the metric you want to see")
      .click();
    popover().contains("Custom Expression").click();
    enterCustomColumnDetails({
      formula: "Offset(Sum([Total]), -1)",
      name: AGGREGATION_NAME,
    });
    popover().button("Done").click();
    addBreakout(BREAKOUT_NAME);

    visualize();
    verifyLineChart({ xAxis: BREAKOUT_NAME, yAxis: AGGREGATION_NAME });

    cy.button("Save").click();
    modal().button("Save").click();
    cy.wait("@saveQuestion");

    cy.reload();
    cy.wait("@dataset");
    verifyLineChart({ xAxis: BREAKOUT_NAME, yAxis: AGGREGATION_NAME });
  });
});

function addBreakout(name: string) {
  getNotebookStep("summarize").findByText("Pick a column to group by").click();
  popover().findByText(name).click();
}

function verifyLineChart({ xAxis, yAxis }: { xAxis: string; yAxis: string }) {
  echartsContainer().within(() => {
    cy.findByText(yAxis).should("be.visible");
    cy.findByText(xAxis).should("be.visible");
  });
}
