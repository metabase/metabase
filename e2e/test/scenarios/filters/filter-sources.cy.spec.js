import {
  filter,
  getNotebookStep,
  popover,
  restore,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const tableQuestion = {
  dataset_query: {
    type: "query",
    query: { "source-table": ORDERS_ID },
    database: SAMPLE_DB_ID,
  },
};

describe("scenarios > filters > filter sources", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("tables", () => {
    it("filter based on a table column", () => {
      visitQuestionAdhoc(tableQuestion, { mode: "notebook" });
      filter({ mode: "notebook" });
      popover().within(() => {
        cy.findByText("Tax").click();
        cy.findByPlaceholderText("Enter a number").type("6.1");
        cy.button("Add filter").click();
      });
      getNotebookStep("filter")
        .findByText("Tax is equal to 6.1")
        .should("be.visible");
      visualize();
      cy.findByTestId("view-footer")
        .findByText(/10 rows/)
        .should("be.visible");
    });
  });
});
