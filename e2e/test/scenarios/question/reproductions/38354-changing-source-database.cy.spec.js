import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  getNotebookStep,
  openNotebook,
  popover,
  restore,
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

const QUESTION_DETAILS = {
  query: {
    "source-table": ORDERS_ID,
    limit: 5,
  },
};

describe("issue 38354", { tags: "@external" }, () => {
  beforeEach(() => {
    restore();
    restore("postgres-12");
    cy.signInAsAdmin();
    cy.createQuestion(QUESTION_DETAILS, { visitQuestion: true });
  });

  it("should be possible to change source database (metabase#38354)", () => {
    openNotebook();
    getNotebookStep("data").findByTestId("data-step-cell").click();
    popover().within(() => {
      cy.icon("chevronleft").click();
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
    });

    // optimization: add a limit so that query runs faster
    cy.button("Row limit").click();
    getNotebookStep("limit").findByPlaceholderText("Enter a limit").type("5");

    visualize();

    cy.findByTestId("query-builder-main")
      .findByText("There was a problem with your question")
      .should("not.exist");
    cy.get("[data-testid=cell-data]").should("contain", "37.65"); // assert visualization renders the data
  });
});
