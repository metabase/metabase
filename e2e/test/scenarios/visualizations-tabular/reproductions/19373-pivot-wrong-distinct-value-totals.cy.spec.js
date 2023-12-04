import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questiondDetails = {
  name: "Products, Distinct values of Rating, Grouped by Category and Created At (year)",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["distinct", ["field", PRODUCTS.RATING, null]]],
    breakout: [
      ["field", PRODUCTS.CATEGORY, null],
      ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
    ],
  },
};

const ROW_TOTALS_INDEX = 4;
const GRAND_TOTALS_INDEX = 4;

describe.skip("issue 19373", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset/pivot").as("pivotDataset");

    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questiondDetails, { visitQuestion: true });
  });

  it("should return correct sum of the distinct values in row totals (metabase#19373)", () => {
    // Convert to the pivot table manually to reflect the real-world scenario
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("Pivot Table-button").should("be.visible").click();
    cy.wait("@pivotDataset");

    cy.findAllByRole("grid").eq(0).as("columnTitles");
    cy.findAllByRole("grid").eq(1).as("rowTitles");
    cy.findAllByRole("grid").eq(2).as("tableCells");

    // Sanity check before we start asserting on this column
    cy.get("@columnTitles")
      .findAllByTestId("pivot-table-cell")
      .eq(ROW_TOTALS_INDEX)
      .should("contain", "Row totals");

    cy.get("@rowTitles")
      .findAllByTestId("pivot-table-cell")
      .eq(GRAND_TOTALS_INDEX)
      .should("contain", "Grand totals");

    cy.get("@tableCells")
      .findAllByTestId("pivot-table-cell")
      .eq(ROW_TOTALS_INDEX)
      .should("contain", "31");
  });
});
