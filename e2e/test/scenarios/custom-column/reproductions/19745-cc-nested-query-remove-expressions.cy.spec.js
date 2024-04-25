import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  editDashboard,
  getDashboardCard,
  getNotebookStep,
  openNotebook,
  restore,
  saveDashboard,
  selectDashboardFilter,
  visitDashboard,
  visitQuestion,
  visualize,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  display: "table",
  query: {
    "source-query": {
      "source-table": PRODUCTS_ID,
      aggregation: [
        ["count"],
        ["sum", ["field", PRODUCTS.PRICE, { "base-type": "type/Float" }]],
      ],
      breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
    },
    fields: [
      ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      ["field", "sum", { "base-type": "type/Float" }],
      ["expression", "Custom Column"],
    ],
    expressions: {
      "Custom Column": ["+", 1, 1],
    },
  },
};

const filterDetails = {
  id: "b6f1865b",
  name: "Date filter",
  slug: "date",
  type: "date/month-year",
  sectionId: "date",
};

const dashboardDetails = {
  name: "Filters",
  parameters: [filterDetails],
};

describe("issue 19745", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should unwrap the nested query when removing the last expression (metabase#19745)", () => {
    updateQuestionAndSelectFilter(() => removeExpression("Custom Column"));
  });

  it("should unwrap the nested query when removing all expressions (metabase#19745)", () => {
    updateQuestionAndSelectFilter(() => removeAllExpressions());
  });
});

function updateQuestionAndSelectFilter(updateExpressions) {
  cy.createQuestionAndDashboard({ questionDetails, dashboardDetails }).then(
    ({ body: { card_id, dashboard_id } }) => {
      visitQuestion(card_id);

      // this should modify the query and remove the second stage
      openNotebook();
      updateExpressions();
      visualize();
      cy.findByTestId("viz-settings-button").click();
      cy.findByRole("button", { name: "Add or remove columns" }).click();
      cy.findByLabelText("Count").should("not.be.checked").click();
      updateQuestion();

      // as we select all columns in the first stage of the query,
      // it should be possible to map a filter to a selected column
      visitDashboard(dashboard_id);
      editDashboard();
      cy.findByText("Date filter").click();
      selectDashboardFilter(getDashboardCard(), "Created At");
      saveDashboard();
    },
  );
}

function removeExpression(name) {
  getNotebookStep("expression", { stage: 1 }).within(() => {
    cy.findByText(name).within(() => {
      cy.icon("close").click();
    });
  });
}

function removeAllExpressions() {
  getNotebookStep("expression", { stage: 1 }).within(() => {
    cy.findByLabelText("Remove step").click({ force: true });
  });
}

function updateQuestion() {
  cy.intercept("PUT", "/api/card/*").as("updateQuestion");
  cy.findByText("Save").click();
  cy.findByTestId("save-question-modal").within(modal => {
    cy.findByText("Save").click();
  });
  cy.wait("@updateQuestion");
}
