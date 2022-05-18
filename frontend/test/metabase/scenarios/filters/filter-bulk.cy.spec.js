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
    cy.findByLabelText("User ID").click();
    cy.findByPlaceholderText("Enter an ID").type("1");
    cy.button("Add filter").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    cy.findByText("User ID is 1").should("be.visible");
    cy.findByText("Showing 11 rows").should("be.visible");
  });
});
