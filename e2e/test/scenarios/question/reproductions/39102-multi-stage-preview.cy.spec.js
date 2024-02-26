import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { getNotebookStep, openNotebook, restore } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "39102",
  query: {
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: ["count"],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
    },
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 1000],
    aggregation: ["count"],
  },
  type: "question",
};

describe("issue 39102", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to preview a multi-stage query (metabase#39102)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    openNotebook();

    getNotebookStep("data", { stage: 0 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Tax").should("be.visible");
      cy.icon("close").click();
    });

    getNotebookStep("summarize", { stage: 0 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("3,610").should("be.visible");
      cy.findByText("744").should("be.visible");
      cy.icon("close").click();
    });

    getNotebookStep("filter", { stage: 1 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("3,610").should("be.visible");
      cy.findByText("744").should("not.exist");
      cy.icon("close").click();
    });

    getNotebookStep("summarize", { stage: 1 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("4").should("be.visible");
    });
  });
});
