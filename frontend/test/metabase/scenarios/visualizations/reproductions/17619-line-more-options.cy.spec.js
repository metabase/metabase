import { restore } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "17619",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month-of-year" }],
      ["field", PRODUCTS.CATEGORY, null],
    ],
  },
  display: "line",
};

describe("issue 17619", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show and open 'More options' on visualizations with multiple lines (metabase#17619)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    cy.findByTestId("viz-settings-button").click();

    openMoreOptionsForCategory("Doohickey");

    cy.findByText("Line style");
    cy.findByText("Show dots on lines");
    cy.findByText("Replace missing values with");
    cy.findByText("Which axis?");
    cy.findByText("Show values for this series");

    cy.icon("chevronup");
  });
});

function openMoreOptionsForCategory(category) {
  cy.findByTestId("sidebar-left").within(() => {
    cy.findByDisplayValue(category)
      .siblings()
      .find(".Icon-chevrondown")
      .click();
  });
}
