import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      filter: ["=", ["field", ORDERS.USER_ID, null], 1],
    },
  },
};

describe("scenarios > filters > bulk filtering", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should modify the filter for a raw query", () => {
    visitQuestionAdhoc(questionDetails);

    cy.findByLabelText("Show more filters").click();
    cy.findByLabelText("User ID").within(() => cy.icon("close").click());
    cy.findByLabelText("Quantity").click();
    cy.findByPlaceholderText("Search the list").type("20");
    cy.findByText("20").click();
    cy.button("Add filter").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    cy.findByText("User ID is 1").should("not.exist");
    cy.findByText("Quantity is equal to 20").should("be.visible");
    cy.findByText("Showing 4 rows").should("be.visible");
  });
});
