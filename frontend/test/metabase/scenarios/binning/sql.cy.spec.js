import {
  restore,
  snapshot,
  visualize,
  changeBinningForDimension,
  summarize,
  startNewQuestion,
} from "__support__/e2e/helpers";

const questionDetails = {
  name: "SQL Binning",
  native: {
    query:
      "SELECT ORDERS.CREATED_AT, ORDERS.TOTAL, PEOPLE.LONGITUDE FROM ORDERS JOIN PEOPLE ON orders.user_id = people.id",
  },
};

describe("scenarios > binning > from a saved sql question", () => {
  before(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(questionDetails, { loadMetadata: true });

    snapshot("binningSql");
  });

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore("binningSql");
    cy.signInAsAdmin();
  });

  context("via simple question", () => {
    beforeEach(() => {
      startNewQuestion();
      cy.findByText("Saved Questions").click();
      cy.findByText("SQL Binning").click();
      visualize();
      cy.findByTextEnsureVisible("LONGITUDE");
      summarize();
    });

    it("should work for time series", () => {
      /*
       * If `result_metadata` is not loaded (SQL question is not run before saving),
       * the granularity is much finer and one can see "by minute" as the default bucket (metabase#16671).
       */
      changeBinningForDimension({
        name: "CREATED_AT",
        fromBinning: "by month",
        toBinning: "Year",
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by CREATED_AT: Year");
      cy.get("circle");
    });

    it("should work for number", () => {
      changeBinningForDimension({
        name: "TOTAL",
        fromBinning: "Auto binned",
        toBinning: "50 bins",
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by TOTAL: 50 bins");
      cy.get(".bar");
    });

    it("should work for longitude", () => {
      /**
       * The correct option should say "Bin every 10 degrees", but this is out of the scope of this test.
       * It was covered in `frontend/test/metabase/scenarios/binning/binning-options.cy.spec.js`
       * Please see: https://github.com/metabase/metabase/issues/16675.
       *
       * TODO: Change back to "Bin every 10 degrees" once metabase#16675 gets fixed.
       */
      changeBinningForDimension({
        name: "LONGITUDE",
        fromBinning: "Auto binned",
        toBinning: "10°",
      });

      waitAndAssertOnRequest("@dataset");

      cy.findByText("Count by LONGITUDE: 10°");
      cy.get(".bar");
    });
  });

  context("via custom question", () => {
    beforeEach(() => {
      startNewQuestion();
      cy.findByText("Saved Questions").click();
      cy.findByText("SQL Binning").click();

      cy.findByText("Pick the metric you want to see").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();
    });

    it("should work for time series", () => {
      changeBinningForDimension({
        name: "CREATED_AT",
        fromBinning: "by month",
        toBinning: "Year",
      });

      cy.findByText("Count by CREATED_AT: Year");

      visualize(response => {
        assertOnResponse(response);
      });

      cy.get("circle");
    });

    it("should work for number", () => {
      changeBinningForDimension({
        name: "TOTAL",
        fromBinning: "Auto binned",
        toBinning: "50 bins",
      });

      cy.findByText("Count by TOTAL: 50 bins");

      visualize(response => {
        assertOnResponse(response);
      });

      cy.get(".bar");
    });

    it("should work for longitude", () => {
      /**
       * The correct option should say "Bin every 10 degrees", but this is out of the scope of this test.
       * It was covered in `frontend/test/metabase/scenarios/binning/binning-options.cy.spec.js`
       * Please see: https://github.com/metabase/metabase/issues/16675
       *
       * TODO: Change back to "Bin every 10 degrees" once metabase#16675 gets fixed.
       */
      changeBinningForDimension({
        name: "LONGITUDE",
        fromBinning: "Auto binned",
        toBinning: "10°",
      });

      cy.findByText("Count by LONGITUDE: 10°");

      visualize(response => {
        assertOnResponse(response);
      });

      cy.get(".bar");
    });
  });

  context("via column popover", () => {
    beforeEach(() => {
      startNewQuestion();
      cy.findByText("Saved Questions").click();
      cy.findByText("SQL Binning").click();
      visualize();
      cy.findByTextEnsureVisible("LONGITUDE");
    });

    it("should work for time series", () => {
      cy.findByText("CREATED_AT").click();
      cy.findByText("Distribution").click();

      assertOnXYAxisLabels({ xLabel: "CREATED_AT", yLabel: "Count" });
      cy.findByText("Count by CREATED_AT: Month");
      cy.get("circle");

      // Open a popover with bucket options from the time series footer
      cy.findAllByTestId("select-button-content").contains("Month").click();
      cy.findByText("Quarter").click();

      cy.findByText("Count by CREATED_AT: Quarter");
      cy.findByText("Q1 - 2017");
    });

    it("should work for number", () => {
      cy.findByText("TOTAL").click();
      cy.findByText("Distribution").click();

      assertOnXYAxisLabels({ xLabel: "TOTAL", yLabel: "Count" });
      cy.findByText("Count by TOTAL: Auto binned");
      cy.get(".bar");
    });

    it("should work for longitude", () => {
      cy.findByText("LONGITUDE").click();
      cy.findByText("Distribution").click();

      assertOnXYAxisLabels({ xLabel: "LONGITUDE", yLabel: "Count" });
      cy.findByText("Count by LONGITUDE: Auto binned");
      cy.get(".bar");
      cy.findByText("170° W");
    });
  });
});

function assertOnXYAxisLabels({ xLabel, yLabel } = {}) {
  cy.get(".x-axis-label").invoke("text").should("eq", xLabel);

  cy.get(".y-axis-label").invoke("text").should("eq", yLabel);
}

function waitAndAssertOnRequest(requestAlias) {
  cy.wait(requestAlias).then(({ response }) => {
    assertOnResponse(response);
  });
}

function assertOnResponse(response) {
  expect(response.body.error).to.not.exist;
}
