import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  getNotebookStep,
  restore,
  saveMetadataChanges,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "29951",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      CC1: ["+", ["field", ORDERS.TOTAL], 1],
      CC2: ["+", ["field", ORDERS.TOTAL], 1],
    },
    limit: 2,
  },
  type: "model",
};

describe("issue 29951", { requestTimeout: 10000, viewportWidth: 1600 }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`).as(
      "publicShema",
    );
  });

  it("should allow to run the model query after changing custom columns (metabase#29951)", () => {
    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      cy.visit(`/model/${id}/query`);
      cy.wait("@publicShema");
    });

    removeExpression("CC2");
    // The UI shows us the "play" icon, indicating we should refresh the query,
    // but the point of this repro is to save without refreshing
    cy.button("Get Answer").should("be.visible");
    saveMetadataChanges();

    cy.findAllByTestId("header-cell").last().should("have.text", "CC1");

    dragColumn(0, 100);
    cy.findByTestId("qb-header").button("Refresh").click();
    cy.wait("@dataset");
    cy.get("[data-testid=cellData]").should("contain", "37.65");
    cy.findByTestId("view-footer").should("contain", "Showing 2 rows");
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
