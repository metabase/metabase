const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PEOPLE, PRODUCTS_ID, PRODUCTS } =
  SAMPLE_DATABASE;

/**
 * The list of issues this spec covers:
 *  - metabase#15446
 *  -
 */
describe("scenarios > binning > from a saved QB question with explicit joins", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.createQuestion({
      name: "QB Binning",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: [
              ["field", PEOPLE.LONGITUDE, { "join-alias": "People" }],
              [
                "field",
                PEOPLE.BIRTH_DATE,
                { "temporal-unit": "default", "join-alias": "People" },
              ],
            ],
            "source-table": PEOPLE_ID,
            condition: [
              "=",
              ["field", ORDERS.USER_ID, null],
              ["field", PEOPLE.ID, { "join-alias": "People" }],
            ],
            alias: "People",
          },
          {
            fields: [["field", PRODUCTS.PRICE, { "join-alias": "Products" }]],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        fields: [["field", ORDERS.ID, null]],
      },
    });

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  context("via simple mode", () => {
    beforeEach(() => {
      H.startNewQuestion();

      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("QB Binning").click();
      });

      H.visualize();
      H.summarize();
    });

    it("should work for time series", () => {
      H.changeBinningForDimension({
        name: "People → Birth Date",
        fromBinning: "by month",
        toBinning: "Year",
      });

      assertQueryBuilderState({
        columnType: "time",
        title: "Count by People → Birth Date: Year",
        values: ["1964", "1971", "1999"],
      });

      // Make sure time series footer works as well
      cy.findByTestId("timeseries-bucket-button").contains("Year").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Quarter").click();

      cy.wait("@dataset");
      H.echartsContainer()
        .get("text")
        .should("contain", "Q1 1968")
        .and("contain", "Q1 1978")
        .and("contain", "Q1 1988")
        .and("contain", "Q1 1998");
    });

    it("should work for number", () => {
      H.changeBinningForDimension({
        name: "Products → Price",
        fromBinning: "Auto bin",
        toBinning: "50 bins",
      });

      assertQueryBuilderState({
        title: "Count by Products → Price: 50 bins",
        values: ["14", "20", "24", "100"],
      });
    });

    it("should work for longitude", () => {
      H.changeBinningForDimension({
        name: "People → Longitude",
        fromBinning: "Auto bin",
        toBinning: "Bin every 20 degrees",
      });

      assertQueryBuilderState({
        title: "Count by People → Longitude: 20°",
        values: ["180° W", "160° W", "60° W"],
      });
    });
  });

  context("via notebook mode", () => {
    beforeEach(() => {
      H.startNewQuestion();

      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("QB Binning").click();
      });

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a function or metric").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count of rows").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
    });

    it("should work for time series", () => {
      H.changeBinningForDimension({
        name: "People → Birth Date",
        fromBinning: "by month",
        toBinning: "Year",
      });

      assertQueryBuilderState({
        columnType: "time",
        mode: "notebook",
        title: "Count by People → Birth Date: Year",
        values: ["1964", "1971", "1999"],
      });

      // Make sure time series footer works as well
      cy.findByTestId("timeseries-bucket-button").contains("Year").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Quarter").click();

      cy.wait("@dataset");
      H.echartsContainer()
        .get("text")
        .should("contain", "Q1 1965")
        .and("contain", "Q1 1972")
        .and("contain", "Q1 2000");
    });

    it("should work for number", () => {
      H.changeBinningForDimension({
        name: "Products → Price",
        fromBinning: "Auto bin",
        toBinning: "50 bins",
      });

      assertQueryBuilderState({
        mode: "notebook",
        title: "Count by Products → Price: 50 bins",
        values: ["14", "20", "24", "100"],
      });
    });

    it("should work for longitude", () => {
      H.changeBinningForDimension({
        name: "People → Longitude",
        fromBinning: "Auto bin",
        toBinning: "Bin every 20 degrees",
      });

      assertQueryBuilderState({
        mode: "notebook",
        title: "Count by People → Longitude: 20°",
        values: ["180° W", "160° W", "60° W"],
      });
    });
  });

  context("via column popover", () => {
    beforeEach(() => {
      H.startNewQuestion();

      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("QB Binning").click();
      });

      H.visualize();
    });

    it("should work for time series", () => {
      H.tableHeaderClick("People → Birth Date");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Distribution").click();

      // Reproduces metabase#16693
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count by People → Birth Date: Month");

      assertOnXYAxisLabels({ xLabel: "People → Birth Date", yLabel: "Count" });

      H.echartsContainer()
        .get("text", { timeout: 1000 })
        .should("contain", "January 1968")
        .and("contain", "January 1978")
        .and("contain", "January 1988")
        .and("contain", "January 1998");

      H.cartesianChartCircle();

      // Make sure time series footer works as well
      cy.findByTestId("timeseries-bucket-button").contains("Month").click();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Quarter").click();

      // Reproduces metabase#16693
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count by People → Birth Date: Quarter");

      H.echartsContainer()
        .get("text")
        .should("contain", "Q1 1965")
        .and("contain", "Q1 1972")
        .and("contain", "Q1 1979")
        .and("contain", "Q1 1986")
        .and("contain", "Q1 1993")
        .and("contain", "Q1 2000");
    });

    it("should work for number", () => {
      H.tableHeaderClick("Products → Price");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Distribution").click();

      // Reproduces metabase#16693
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count by Products → Price: Auto binned");

      assertOnXYAxisLabels({ xLabel: "Products → Price", yLabel: "Count" });

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("12.5");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("25");

      H.chartPathWithFillColor("#509EE3");
    });

    it("should work for longitude", () => {
      H.tableHeaderClick("People → Longitude");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Distribution").click();

      // Reproduces metabase#16693
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Count by People → Longitude: Auto binned");

      assertOnXYAxisLabels({
        xLabel: "People → Longitude",
        yLabel: "Count",
      });

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("170° W");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("160° W");

      H.chartPathWithFillColor("#509EE3");
    });
  });
});

function assertOnXYAxisLabels({ xLabel, yLabel } = {}) {
  H.echartsContainer().get("text").contains(xLabel);

  H.echartsContainer().get("text").contains(yLabel);
}

function waitAndAssertOnRequest(requestAlias) {
  cy.wait(requestAlias).then((xhr) => {
    expect(xhr.response.body.error).to.not.exist;
  });
}

function assertQueryBuilderState({
  columnType,
  title,
  mode = null,
  values,
} = {}) {
  if (mode === "notebook") {
    H.visualize();
  } else {
    waitAndAssertOnRequest("@dataset");
  }

  const visualizationSelector = columnType === "time" ? "circle" : "bar";

  if (visualizationSelector === "circle") {
    H.cartesianChartCircle();
  } else {
    H.chartPathWithFillColor("#509EE3");
  }

  cy.findByText(title);

  H.echartsContainer().get("text").should("contain", "Count");

  if (values) {
    H.echartsContainer().within(() => {
      values.forEach((value) => {
        cy.findByText(value);
      });
    });
  }
}
