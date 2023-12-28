import { restore } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "21135",
  query: {
    "source-table": PRODUCTS_ID,
    limit: 5,
    expressions: { Price: ["+", ["field", PRODUCTS.PRICE, null], 2] },
  },
};

describe("issue 21135", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });

    switchToNotebookView();
  });

  it("should handle cc with the same name as the table column (metabase#21135)", () => {
    cy.findAllByTestId("notebook-cell-item").contains("Price").click();
    cy.button("Update").click();

    previewCustomColumnNotebookStep();

    // We should probably use data-testid or some better selector but it is crucial
    // to narrow the results to the preview area to avoid false positive result.
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Rustic Paper Wallet");

      cy.findAllByText("Price").should("have.length", 2);

      cy.findByText("29.46"); // actual Price column
      cy.findByText("31.46"); // custom column
    });
  });
});

function switchToNotebookView() {
  cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`).as(
    "publicSchema",
  );

  cy.icon("notebook").click();
  cy.wait("@publicSchema");
}

function previewCustomColumnNotebookStep() {
  cy.intercept("POST", "/api/dataset").as("dataset");

  cy.findByTestId("step-expression-0-0").find(".Icon-play").click();

  cy.wait("@dataset");
}
