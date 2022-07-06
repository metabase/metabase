import {
  restore,
  visualize,
  changeBinningForDimension,
  summarize,
  startNewQuestion,
} from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PEOPLE, PRODUCTS_ID, PRODUCTS } =
  SAMPLE_DATABASE;

/**
 * The list of issues this spec covers:
 *  - metabase#15446
 *  -
 */
describe("scenarios > binning > from a saved QB question with explicit joins", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion({
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
      startNewQuestion();
      cy.findByText("Saved Questions").click();
      cy.findByText("QB Binning").click();

      visualize();
      summarize();
    });

    it("should work for time series", () => {
      changeBinningForDimension({
        name: "People → Birth Date",
        fromBinning: "by month",
        toBinning: "Year",
      });

      assertQueryBuilderState({
        columnType: "time",
        title: "Count by People → Birth Date: Year",
        values: ["1960", "1965", "2000"],
      });

      // Make sure time series footer works as well
      cy.findAllByTestId("select-button-content").contains("Year").click();
      cy.findByText("Quarter").click();

      cy.wait("@dataset");
      cy.get(".axis.x")
        .should("contain", "Q1 - 1960")
        .and("contain", "Q1 - 1965")
        .and("contain", "Q1 - 2000");
    });

    it("should work for number", () => {
      changeBinningForDimension({
        name: "Products → Price",
        fromBinning: "Auto bin",
        toBinning: "50 bins",
      });

      assertQueryBuilderState({
        title: "Count by Products → Price: 50 bins",
        values: ["14", "18", "20", "100"],
      });
    });

    it("should work for longitude", () => {
      changeBinningForDimension({
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
      startNewQuestion();
      cy.findByText("Saved Questions").click();
      cy.findByText("QB Binning").click();

      cy.findByText("Pick the metric you want to see").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();
    });

    it("should work for time series", () => {
      changeBinningForDimension({
        name: "People → Birth Date",
        fromBinning: "by month",
        toBinning: "Year",
      });

      assertQueryBuilderState({
        columnType: "time",
        mode: "notebook",
        title: "Count by People → Birth Date: Year",
        values: ["1960", "1965", "2000"],
      });

      // Make sure time series footer works as well
      cy.findAllByTestId("select-button-content").contains("Year").click();
      cy.findByText("Quarter").click();

      cy.wait("@dataset");
      cy.get(".axis.x")
        .should("contain", "Q1 - 1960")
        .and("contain", "Q1 - 1965")
        .and("contain", "Q1 - 2000");
    });

    it("should work for number", () => {
      changeBinningForDimension({
        name: "Products → Price",
        fromBinning: "Auto bin",
        toBinning: "50 bins",
      });

      assertQueryBuilderState({
        mode: "notebook",
        title: "Count by Products → Price: 50 bins",
        values: ["14", "18", "20", "100"],
      });
    });

    it("should work for longitude", () => {
      changeBinningForDimension({
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
      startNewQuestion();
      cy.findByText("Saved Questions").click();
      cy.findByText("QB Binning").click();
      visualize();
    });

    it("should work for time series", () => {
      cy.findByText("People → Birth Date").click();
      cy.findByText("Distribution").click();

      // Reproduces metabase#16693
      cy.findByText("Count by People → Birth Date: Month");

      assertOnXYAxisLabels({ xLabel: "People → Birth Date", yLabel: "Count" });

      cy.get(".axis.x", { timeout: 1000 })
        .should("contain", "January, 1960")
        .and("contain", "January, 1965")
        .and("contain", "January, 2000");

      cy.get("circle");

      // Make sure time series footer works as well
      cy.findAllByTestId("select-button-content").contains("Month").click();
      cy.findByText("Quarter").click();

      // Reproduces metabase#16693
      cy.findByText("Count by People → Birth Date: Quarter");

      cy.get(".axis.x")
        .should("contain", "Q1 - 1960")
        .and("contain", "Q1 - 1965")
        .and("contain", "Q1 - 2000");
    });

    it("should work for number", () => {
      cy.findByText("Products → Price").click();
      cy.findByText("Distribution").click();

      // Reproduces metabase#16693
      cy.findByText("Count by Products → Price: Auto binned");

      assertOnXYAxisLabels({ xLabel: "Products → Price", yLabel: "Count" });

      cy.findByText("12.5");
      cy.findByText("25");

      cy.get(".bar");
    });

    it("should work for longitude", () => {
      cy.findByText("People → Longitude").click();
      cy.findByText("Distribution").click();

      // Reproduces metabase#16693
      cy.findByText("Count by People → Longitude: Auto binned");

      assertOnXYAxisLabels({
        xLabel: "People → Longitude",
        yLabel: "Count",
      });

      cy.findByText("170° W");
      cy.findByText("160° W");

      cy.get(".bar");
    });
  });
});

function assertOnXYAxisLabels({ xLabel, yLabel } = {}) {
  cy.get(".x-axis-label").invoke("text").should("eq", xLabel);

  cy.get(".y-axis-label").invoke("text").should("eq", yLabel);
}

function waitAndAssertOnRequest(requestAlias) {
  cy.wait(requestAlias).then(xhr => {
    expect(xhr.response.body.error).to.not.exist;
  });
}

function assertQueryBuilderState({
  columnType,
  title,
  mode = null,
  values,
} = {}) {
  mode === "notebook" ? visualize() : waitAndAssertOnRequest("@dataset");

  const visualizaitonSelector = columnType === "time" ? "circle" : ".bar";
  cy.get(visualizaitonSelector);

  cy.findByText(title);

  cy.get(".y-axis-label").invoke("text").should("eq", "Count");

  values &&
    cy.get(".axis.x").within(() => {
      values.forEach(value => {
        cy.findByText(value);
      });
    });
}
