import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visitQuestionAdhoc,
  popover,
  openSeriesSettings,
  cartesianChartCircle,
  testPairedTooltipValues,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  dataset_query: {
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["cum-sum", ["field", ORDERS.QUANTITY, null]]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
    },
    database: 1,
  },
  display: "line",
};

describe("issue 21452", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails);

    cy.findByTestId("viz-settings-button").click();
  });

  it("should not fire POST request after every character during display name change (metabase#21452)", () => {
    openSeriesSettings("Cumulative sum of Quantity");
    cy.findByDisplayValue("Cumulative sum of Quantity").clear().type("Foo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Display type").click();
    // Dismiss the popup and close settings
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    cartesianChartCircle().first().realHover();

    popover().within(() => {
      testPairedTooltipValues("Created At", "2022");
      testPairedTooltipValues("Foo", "3,236");
    });

    cy.get("@dataset.all").should("have.length", 1);
  });
});
