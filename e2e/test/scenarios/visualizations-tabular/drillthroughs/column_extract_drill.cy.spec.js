import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  openOrdersTable,
  popover,
  restore,
  visualize,
} from "e2e/support/helpers";

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

const DATE_QUESTION = {
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["min", ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }]],
    ],
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
    describe("date options", () => {
      DATE_CASES.forEach(({ option, value }) => {
        it(option, () => {
          openOrdersTable({ limit: 1 });
          cy.wait("@dataset");
          extractColumnAndCheck("Created At", option, value);
        });
      });
    });

    it("should add an expression based on a breakout column", () => {
      cy.createQuestion(DATE_QUESTION, { visitQuestion: true });
      extractColumnAndCheck("Created At: Month", "Month of year", "Apr");
    });

    it("should add an expression based on an aggregation column", () => {
      cy.createQuestion(DATE_QUESTION, { visitQuestion: true });
      extractColumnAndCheck("Min of Created At: Default", "Year", "2,022");
    });

    it("should be able to modify the expression in the notebook editor", () => {
      openOrdersTable({ limit: 1 });
      cy.wait("@dataset");
      extractColumnAndCheck("Created At", "Year", "2,025");
      cy.wait("@dataset");
      openNotebook();
      getNotebookStep("expression").findByText("Year").click();
      enterCustomColumnDetails({ formula: "+ 2" });
      popover().button("Update").click();
      visualize();
      cy.wait("@dataset");
      cy.findByRole("gridcell", { name: "2,027" }).should("be.visible");
    });

    it("should use current user locale for string expressions", () => {
      cy.request("GET", "/api/user/current").then(({ body: user }) => {
        cy.request("PUT", `/api/user/${user.id}`, { locale: "de" });
      });
      openOrdersTable({ limit: 1 });
      cy.wait("@dataset");
      extractColumnAndCheck("Created At", "Tag der Woche", "Dienstag");
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
