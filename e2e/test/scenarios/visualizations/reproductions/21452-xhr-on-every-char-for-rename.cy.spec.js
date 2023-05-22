import {
  restore,
  visitQuestionAdhoc,
  popover,
  openSeriesSettings,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
    openSeriesSettings("Sum of Quantity");
    cy.findByDisplayValue("Sum of Quantity").clear().type("Foo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Display type").click();
    // Blur will result in another POST request which is expected
    cy.wait("@dataset");
    // Dismiss the popup and close settings
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    cy.get("circle").first().realHover();

    popover().within(() => {
      testPairedTooltipValues("Created At", "2016");
      testPairedTooltipValues("Foo", "3,236");
    });

    cy.get("@dataset.all").should("have.length", 2);
  });
});

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1).closest("td").siblings("td").findByText(val2);
}
