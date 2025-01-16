import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const CREATED_AT_BREAKOUT = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "day-of-week",
  },
];

describe("issue 23851", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("can drill through question with temporal extraction breakout without semantic type defined for the column (metabase#23851)", () => {
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });
    cy.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [CREATED_AT_BREAKOUT],
        },
        display: "bar",
      },
      { visitQuestion: true },
    );

    cy.chartPathWithFillColor("#509EE3").should("have.length", 7);
    cy.chartPathWithFillColor("#509EE3").eq(5).click();
    cy.popover().findByText("See these Orders").click();

    cy.wait("@dataset");

    cy.findByTestId("filter-pill").should(
      "have.text",
      "Created At: Day of week is equal to 6",
    );
    cy.get("[data-testid=cell-data]").should("contain", "109.22");
    cy.openNotebook();
    cy.getNotebookStep("filter")
      .findByText("Created At: Day of week is equal to 6")
      .should("exist");
  });
});
