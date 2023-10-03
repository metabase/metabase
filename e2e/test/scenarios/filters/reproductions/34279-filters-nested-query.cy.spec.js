import {
  restore,
  popover,
  startNewQuestion,
  getNotebookStep,
  visualize,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Test Question",
  query: {
    "source-table": PRODUCTS_ID,
    aggregations: [["count"]],
    breakouts: [
      ["field", PRODUCTS.CATEGORY, null],
      ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
    ],
  },
};

describe("issue 34279", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should allow to add filters in nested queries (metabase#34279)", () => {
    cy.createQuestion(questionDetails).then(({ body: card }) => {
      startNewQuestion();
      popover().within(() => {
        cy.findByText("Saved Questions").click();
        cy.findByText(questionDetails.name).click();
      });
      getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();
      popover().within(() => {
        cy.findByText("Category").click();
        cy.findByText("Widget").click();
        cy.button("Add filter").click();
      });
      visualize();
      cy.findByTestId("qb-filters-panel")
        .findByText("Category is Widget")
        .should("be.visible");
    });
  });
});
