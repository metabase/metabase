import {
  restore,
  changeBinningForDimension,
  visualize,
  summarize,
  visitQuestion,
} from "__support__/e2e/helpers";

/**
 * The list of issues this spec covers:
 *  - metabase#15648
 *  -
 */

describe("scenarios > binning > from a saved QB question using implicit joins", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  context("via simple question", () => {
    beforeEach(() => {
      visitQuestion(1);
      summarize();
    });

    it("should work for time series", () => {
      changeBinningForDimension({
        name: "Birth Date",
        fromBinning: "by month",
        toBinning: "Year",
      });

      assertQueryBuilderState({
        title: "Count by User → Birth Date: Year",
        values: ["1958", "313"],
      });

      // Make sure time series assertQueryBuilderState works as well
      cy.findAllByTestId("select-button-content").contains("Year").click();
      cy.findByText("Month").click();

      cy.get(".cellData").should("contain", "April, 1958").and("contain", "37");
    });

    it("should work for number", () => {
      changeBinningForDimension({
        name: "Price",
        fromBinning: "Auto binned",
        toBinning: "50 bins",
      });

      assertQueryBuilderState({
        title: "Count by Product → Price: 50 bins",
        values: ["14  –  16", "96"],
      });
    });

    it("should work for longitude", () => {
      changeBinningForDimension({
        name: "Longitude",
        fromBinning: "Auto binned",
        // Test is currently incorrect in that it displays wrong binning options (please see: https://github.com/metabase/metabase/issues/16674)
        // Once #16674 gets fixed, update the following line to say: `bucketSize: "Bin every 20 degrees"`
        toBinning: "20°",
      });

      assertQueryBuilderState({
        title: "Count by User → Longitude: 20°",
        values: ["180° W  –  160° W", "75"],
      });
    });
  });

  context("via custom question", () => {
    beforeEach(() => {
      cy.visit("/question/1/notebook");
      summarize({ mode: "notebook" });
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();
      // Click "Order" accordion to collapse it and expose the other tables
      cy.findByText("Order").click();
    });

    it("should work for time series", () => {
      cy.findByText("User").click();
      cy.findByPlaceholderText("Find...").type("birth");

      changeBinningForDimension({
        name: "Birth Date",
        fromBinning: "by month",
        toBinning: "Year",
      });

      assertQueryBuilderState({
        title: "Count by User → Birth Date: Year",
        mode: "notebook",
        values: ["1958", "313"],
      });

      // Make sure time series assertQueryBuilderStateter works as well
      cy.findAllByTestId("select-button-content").contains("Year").click();
      cy.findByText("Month").click();

      cy.get(".cellData").should("contain", "April, 1958").and("contain", "37");
    });

    it("should work for number", () => {
      cy.findByText("Product").click();

      changeBinningForDimension({
        name: "Price",
        fromBinning: "Auto binned",
        toBinning: "50 bins",
      });

      assertQueryBuilderState({
        title: "Count by Product → Price: 50 bins",
        mode: "notebook",
        values: ["14  –  16", "96"],
      });
    });

    it("should work for longitude", () => {
      cy.findByText("User").click();
      cy.findByPlaceholderText("Find...").type("longitude");

      changeBinningForDimension({
        name: "Longitude",
        fromBinning: "Auto binned",
        // Test is currently incorrect in that it displays wrong binning options (please see: https://github.com/metabase/metabase/issues/16674)
        // Once #16674 gets fixed, update the following line to say: `bucketSize: "Bin every 20 degrees"`
        toBinning: "20°",
      });

      assertQueryBuilderState({
        title: "Count by User → Longitude: 20°",
        mode: "notebook",
        values: ["180° W  –  160° W", "75"],
      });
    });
  });
});

function waitAndAssertOnRequest(requestAlias) {
  cy.wait(requestAlias).then(xhr => {
    expect(xhr.response.body.error).to.not.exist;
  });
}

function assertQueryBuilderState({ title, mode = null, values } = {}) {
  const [firstValue, lastValue] = values;

  mode === "notebook" ? visualize() : waitAndAssertOnRequest("@dataset");

  cy.findByText(title);
  cy.get(".cellData").should("contain", firstValue).and("contain", lastValue);
}
