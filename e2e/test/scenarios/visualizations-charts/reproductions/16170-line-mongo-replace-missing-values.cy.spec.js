import {
  restore,
  withDatabase,
  popover,
  openSeriesSettings,
  cartesianChartCircle,
  echartsContainer,
  testPairedTooltipValues,
} from "e2e/support/helpers";

const externalDatabaseId = 2;

describe("issue 16170", { tags: "@mongo" }, () => {
  beforeEach(() => {
    restore("mongo-5");
    cy.signInAsAdmin();

    withDatabase(externalDatabaseId, ({ ORDERS, ORDERS_ID }) => {
      const questionDetails = {
        name: "16170",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        database: externalDatabaseId,
        display: "line",
      };

      cy.createQuestion(questionDetails, { visitQuestion: true });
    });
  });

  ["Zero", "Nothing"].forEach(replacementValue => {
    it(`replace missing values with "${replacementValue}" should work on Mongo (metabase#16170)`, () => {
      cy.findByTestId("viz-settings-button").click();

      openSeriesSettings("Count");

      replaceMissingValuesWith(replacementValue);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Done").click();

      assertOnTheYAxis();

      cartesianChartCircle().eq(-2).trigger("mousemove");

      popover().within(() => {
        testPairedTooltipValues("Created At", "2019");
        testPairedTooltipValues("Count", "6,524");
      });
    });
  });
});

function replaceMissingValuesWith(value) {
  cy.findByText("Replace missing values with")
    .parent()
    .within(() => {
      cy.findByTestId("select-button").click();
    });

  popover().contains(value).click();
}

function assertOnTheYAxis() {
  echartsContainer().get("text").contains("Count");

  echartsContainer().get("text").contains("6,000");
}
