const { H } = cy;
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

/**
 * The list of issues this spec covers:
 *  - metabase#15648
 *  -
 */

describe("scenarios > binning > from a saved QB question using implicit joins", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  context("via simple question", () => {
    beforeEach(() => {
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.summarize();
    });

    it("should work for time series", () => {
      H.changeBinningForDimension({
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Month").click();

      cy.get("[data-testid=cell-data]")
        .should("contain", "April 1958")
        .and("contain", "37");
    });

    it("should work for number", () => {
      H.changeBinningForDimension({
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
      H.changeBinningForDimension({
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
      H.summarize({ mode: "notebook" });
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count of rows").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      // Click "Order" accordion to collapse it and expose the other tables
      H.popover().findByText("Orders").click();
    });

    it("should work for time series", () => {
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("User").click();
      cy.findByPlaceholderText("Find...").type("birth");

      H.changeBinningForDimension({
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Month").click();

      cy.get("[data-testid=cell-data]")
        .should("contain", "April 1958")
        .and("contain", "37");
    });

    it("should work for number", () => {
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Product").click();

      H.changeBinningForDimension({
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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("User").click();
      cy.findByPlaceholderText("Find...").type("longitude");

      H.changeBinningForDimension({
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
  cy.wait(requestAlias).then((xhr) => {
    expect(xhr.response.body.error).to.not.exist;
  });
}

function assertQueryBuilderState({ title, mode = null, values } = {}) {
  const [firstValue, lastValue] = values;

  if (mode === "notebook") {
    H.visualize();
  } else {
    waitAndAssertOnRequest("@dataset");
  }

  cy.findByText(title);
  cy.get("[data-testid=cell-data]")
    .should("contain", firstValue)
    .and("contain", lastValue);
}
