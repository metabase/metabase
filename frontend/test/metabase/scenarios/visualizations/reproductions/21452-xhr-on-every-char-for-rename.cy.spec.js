import { restore, visitQuestionAdhoc, popover } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

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

    cy.findByText("Settings").click();
  });

  it("should not fire POST request after every character during display name change (metabase#21452)", () => {
    cy.findByDisplayValue("Sum of Quantity").clear().type("Foo").blur();
    // Blur will result in another POST request which is expected
    cy.wait("@dataset");

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
