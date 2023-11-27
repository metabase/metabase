import { restore, summarize, popover, sidebar } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "20548",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["sum", ["field", PRODUCTS.PRICE, null]], ["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  display: "bar",
  // We are reversing the order of metrics via API
  visualization_settings: {
    "graph.metrics": ["count", "sum"],
    "graph.dimensions": ["CATEGORY"],
  },
};

describe("issue 20548", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
    summarize();
  });

  it("should not display duplicate Y-axis after modifying/reordering metrics (metabase#20548)", () => {
    removeAggregationItem("Count");
    cy.get(".bar").should("have.length", 4);

    addAggregationItem("Count");
    cy.get(".bar").should("have.length", 8);

    // Although the test already fails on the previous step, let's add some more assertions to prevent future regressions
    assertOnLegendItemFrequency("Count", 1);
    assertOnLegendItemFrequency("Sum of Price", 1);

    cy.findByTestId("viz-settings-button").click();
    // Implicit assertion - it would fail if it finds more than one "Count" in the sidebar
    sidebar().findAllByText("Count").should("have.length", 1);
  });
});

function removeAggregationItem(item) {
  cy.findAllByTestId("aggregation-item")
    .contains(item)
    .siblings(".Icon-close")
    .click();

  cy.wait("@dataset");
}

function addAggregationItem(item) {
  cy.findByTestId("add-aggregation-button").click();
  popover().contains(item).click();

  cy.wait("@dataset");
}

/**
 * @param {string} item
 * @param {number} frequency
 */
function assertOnLegendItemFrequency(item, frequency) {
  cy.findAllByTestId("legend-item")
    .contains(item)
    .should("have.length", frequency);
}
