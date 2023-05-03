import {
  getNotebookStep,
  openQuestionActions,
  restore,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "29951",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      CC1: ["+", ["field", ORDERS.TOTAL], 1],
      CC2: ["+", ["field", ORDERS.TOTAL], 1],
    },
  },
  dataset: true,
};

describe("issue 29951", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should allow to run the model query after changing custom columns (metabase#29951)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    cy.wait("@dataset");

    openQuestionActions();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Edit query definition").click();
    removeExpression("CC2");
    cy.findByRole("button", { name: "Save changes" }).click();
    cy.wait("@updateCard");
    cy.wait("@dataset");

    dragColumn(0, 100);
    cy.findAllByRole("button", { name: "Get Answer" }).first().click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing first 2,000 rows").should("be.visible");
  });
});

const removeExpression = name => {
  getNotebookStep("expression")
    .findByText(name)
    .findByLabelText("close icon")
    .click();
};

const dragColumn = (index, distance) => {
  cy.get(".react-draggable")
    .eq(index)
    .trigger("mousedown", 0, 0, { force: true })
    .trigger("mousemove", distance, 0, { force: true })
    .trigger("mouseup", distance, 0, { force: true });
};
