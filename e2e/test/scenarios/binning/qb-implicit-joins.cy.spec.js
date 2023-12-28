import {
  restore,
  changeBinningForDimension,
  visualize,
  summarize,
  visitQuestion,
} from "e2e/support/helpers";

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

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
      visitQuestion(ORDERS_QUESTION_ID);
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
      cy.findByTestId("timeseries-bucket-button").contains("Year").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Month").click();

      cy.get(".cellData").should("contain", "April 1958").and("contain", "37");
    });

    it("should work for number", () => {
      changeBinningForDimension({
        name: "Price",
        fromBinning: "Auto bin",
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
        fromBinning: "Auto bin",
        toBinning: "Bin every 20 degrees",
      });

      assertQueryBuilderState({
        title: "Count by User → Longitude: 20°",
        values: ["180° W  –  160° W", "75"],
      });
    });
  });

  context("via custom question", () => {
    beforeEach(() => {
      cy.visit(`/question/${ORDERS_QUESTION_ID}/notebook`);
      summarize({ mode: "notebook" });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count of rows").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      // Click "Order" accordion to collapse it and expose the other tables
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Order").click();
    });

    it("should work for time series", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
      cy.findByTestId("timeseries-bucket-button").contains("Year").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Month").click();

      cy.get(".cellData").should("contain", "April 1958").and("contain", "37");
    });

    it("should work for number", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Product").click();

      changeBinningForDimension({
        name: "Price",
        fromBinning: "Auto bin",
        toBinning: "50 bins",
      });

      assertQueryBuilderState({
        title: "Count by Product → Price: 50 bins",
        mode: "notebook",
        values: ["14  –  16", "96"],
      });
    });

    it("should work for longitude", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("User").click();
      cy.findByPlaceholderText("Find...").type("longitude");

      changeBinningForDimension({
        name: "Longitude",
        fromBinning: "Auto bin",
        toBinning: "Bin every 20 degrees",
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
