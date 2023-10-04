import {
  getNotebookStep,
  openQuestionActions,
  popover,
  restore,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "29951",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      CC1: ["+", ["field", ORDERS.TOTAL], 1],
      CC2: ["+", ["field", ORDERS.TOTAL], 1],
    },
    limit: 5,
  },
  dataset: true,
};

describe("issue 29951", { requestTimeout: 10000 }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`).as(
      "publicShema",
    );
  });

  it("should allow to run the model query after changing custom columns (metabase#29951)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    openQuestionActions();
    popover().findByText("Edit query definition").click();
    cy.wait("@publicShema");
    removeExpression("CC2");
    // The UI shows us the "play" icon, indicating we should refresh the query,
    // but the point of this repro is to save without refreshing
    cy.button("Get Answer").should("be.visible");
    cy.button("Save changes").click();
    cy.wait(["@updateCard", "@dataset"]);

    dragColumn(0, 100);
    cy.findByTestId("qb-header").button("Refresh").click();
    cy.wait("@dataset");
    cy.findByTestId("view-footer").should("contain", "Showing 5 rows");
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
    .should("have.length", 20) // 10 columns X 2 draggable elements
    .eq(index)
    .trigger("mousedown", 0, 0, { force: true })
    .trigger("mousemove", distance, 0, { force: true })
    .trigger("mouseup", distance, 0, { force: true });
};
