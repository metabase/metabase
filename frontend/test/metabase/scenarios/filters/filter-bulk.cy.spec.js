import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > filters > bulk filtering", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should add a new filter in the modal", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
        },
      },
    });

    cy.findByLabelText("Show more filters").click();
    cy.findByLabelText("Total").click();
    cy.findByText("Equal to").click();
    cy.findByText("Greater than").click();
    cy.findByPlaceholderText("Enter a number").type("150");
    cy.button("Add filter").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    cy.findByText("Total is greater than 150").should("be.visible");
    cy.findByText("Showing 256 rows").should("be.visible");
  });
});
