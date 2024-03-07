import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { openOrdersTable, popover, restore } from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const DATE_CASES = [
  {
    option: "Hour of day",
    value: "21",
  },
  {
    option: "Day of month",
    value: "11",
  },
  {
    option: "Day of week",
    value: "Tuesday",
  },
  {
    option: "Month of year",
    value: "Feb",
  },
  {
    option: "Quarter of year",
    value: "Q1",
  },
  {
    option: "Year",
    value: "2,025",
  },
];

const BREAKOUT_QUESTION = {
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
    limit: 1,
  },
};

describe("extract action", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  describe("date columns", () => {
    describe("field column", () => {
      DATE_CASES.forEach(({ option, value }) => {
        it(option, () => {
          openOrdersTable({ limit: 1 });
          cy.wait("@dataset");
          extractColumnAndCheck("Created At", option, value);
        });
      });
    });

    describe("aggregation column", () => {
      it("should add an expression based on an aggregation column", () => {
        cy.createQuestion(BREAKOUT_QUESTION, { visitQuestion: true });
        extractColumnAndCheck("Created At: Month", "Month of year", "Apr");
      });
    });
  });
});

function extractColumnAndCheck(column, option, value) {
  cy.findByRole("columnheader", { name: column }).click();
  popover().findByText("Extract day, month…").click();
  popover().findByText(option).click();
  cy.wait("@dataset");

  cy.findByRole("columnheader", { name: option }).should("be.visible");
  cy.findByRole("gridcell", { name: value }).should("be.visible");
}
