import { restore, withDatabase, popover } from "__support__/e2e/helpers";

const externalDatabaseId = 2;

describe("issue 16170", () => {
  beforeEach(() => {
    restore("mongo-4");
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

      replaceMissingValuesWith(replacementValue);

      assertOnTheYAxis();

      cy.get(".dot")
        .eq(-2)
        .trigger("mousemove", { force: true });

      popover().within(() => {
        testPairedTooltipValues("Created At", "2018");
        testPairedTooltipValues("Count", "6,578");
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

  popover()
    .contains(value)
    .click();
}

function assertOnTheYAxis() {
  cy.get(".y-axis-label").findByText("Count");

  cy.get(".axis.y .tick")
    .should("have.length.gt", 10)
    .and("contain", "6,000");
}

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1)
    .closest("td")
    .siblings("td")
    .findByText(val2);
}
