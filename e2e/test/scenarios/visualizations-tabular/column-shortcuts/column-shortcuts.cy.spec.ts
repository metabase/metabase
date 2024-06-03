import _ from "underscore";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  describeWithSnowplow,
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  openOrdersTable,
  popover,
  restore,
  visualize,
  createQuestion,
  expectGoodSnowplowEvent,
  resetSnowplow,
  expectNoBadSnowplowEvents,
} from "e2e/support/helpers";

const { PEOPLE, PEOPLE_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const DATE_CASES = [
  {
    option: "Hour of day",
    value: "21",
    example: "0, 1",
    expressions: ["get-hour"],
  },
  {
    option: "Day of month",
    value: "11",
    example: "1, 2",
    expressions: ["get-day"],
  },
  {
    option: "Day of week",
    value: "Tuesday",
    example: "Monday, Tuesday",
    expressions: ["day-name", "get-day-of-week"],
  },
  {
    option: "Month of year",
    value: "Feb",
    example: "Jan, Feb",
    expressions: ["month-name", "get-month"],
  },
  {
    option: "Quarter of year",
    value: "Q1",
    example: "Q1, Q2",
    expressions: ["quarter-name", "get-quarter"],
  },
  {
    option: "Year",
    value: "2,025",
    example: "2023, 2024",
    expressions: ["get-year"],
  },
];

const EMAIL_CASES = [
  {
    option: "Domain",
    value: "yahoo",
    example: "example, online",
    expressions: ["domain"],
  },
  {
    option: "Host",
    value: "yahoo.com",
    example: "example.com, online.com",
    expressions: ["host"],
  },
];

const URL_CASES = [
  {
    option: "Domain",
    value: "yahoo",
    example: "example, online",
    expressions: ["domain"],
  },
  {
    option: "Subdomain",
    value: "",
    example: "www, maps",
    expressions: ["subdomain"],
  },
  {
    option: "Host",
    value: "yahoo.com",
    example: "example.com, online.com",
    expressions: ["host"],
  },
];

describeWithSnowplow("extract shortcut", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();

    cy.signInAsAdmin();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  describe("date columns", () => {
    describe("should add a date expression for each option", () => {
      DATE_CASES.forEach(({ option, value, example, expressions }) => {
        it(option, () => {
          openOrdersTable({ limit: 1 });
          extractColumnAndCheck({
            column: "Created At",
            option,
            value,
            example,
          });
          expectGoodSnowplowEvent({
            event: "column_extract_via_plus_modal",
            custom_expressions_used: expressions,
            database_id: SAMPLE_DB_ID,
          });
        });
      });
    });

    it("should handle duplicate expression names", () => {
      openOrdersTable({ limit: 1 });
      extractColumnAndCheck({
        column: "Created At",
        option: "Hour of day",
        newColumn: "Hour of day",
      });
      extractColumnAndCheck({
        column: "Created At",
        option: "Hour of day",
        newColumn: "Hour of day_2",
      });
    });

    it("should be able to modify the expression in the notebook editor", () => {
      openOrdersTable({ limit: 1 });
      extractColumnAndCheck({
        column: "Created At",
        option: "Year",
        value: "2,025",
      });
      openNotebook();
      getNotebookStep("expression").findByText("Year").click();
      enterCustomColumnDetails({ formula: "year([Created At]) + 2" });
      popover().button("Update").click();
      visualize();
      cy.findByRole("gridcell", { name: "2,027" }).should("be.visible");
    });
  });

  describe("email columns", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    EMAIL_CASES.forEach(({ option, value, example, expressions }) => {
      it(option, () => {
        createQuestion(
          {
            query: {
              "source-table": PEOPLE_ID,
              limit: 1,
            },
          },
          {
            visitQuestion: true,
          },
        );

        extractColumnAndCheck({
          column: "Email",
          option,
          value,
          example,
        });
        expectGoodSnowplowEvent({
          event: "column_extract_via_plus_modal",
          custom_expressions_used: expressions,
          database_id: SAMPLE_DB_ID,
        });
      });
    });
  });

  describe("url columns", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();

      // Make the Email column a URL column for these tests, to avoid having to create a new model
      cy.request("PUT", `/api/field/${PEOPLE.EMAIL}`, {
        semantic_type: "type/URL",
      });
    });

    URL_CASES.forEach(({ option, value, example, expressions }) => {
      it(option, () => {
        createQuestion(
          {
            query: {
              "source-table": PEOPLE_ID,
              limit: 1,
            },
          },
          {
            visitQuestion: true,
          },
        );

        extractColumnAndCheck({
          column: "Email",
          option,
          value,
          example,
        });
        expectGoodSnowplowEvent({
          event: "column_extract_via_plus_modal",
          custom_expressions_used: expressions,
          database_id: SAMPLE_DB_ID,
        });
      });
    });
  });

  it("should disable the scroll behaviour after it has been rendered", () => {
    createQuestion(
      {
        query: {
          "source-table": PEOPLE_ID,
          limit: 1,
        },
      },
      {
        visitQuestion: true,
      },
    );

    extractColumnAndCheck({
      column: "Email",
      option: "Host",
    });

    cy.get("#main-data-grid").scrollTo("left", { duration: 2000 / 60 });

    cy.findAllByRole("columnheader", { name: "ID" })
      .should("be.visible")
      .click();

    // Change sort direction
    popover().findAllByRole("button").first().click();

    // ID should still be visible (ie. no scrolling to the end should have happened)
    cy.findAllByRole("columnheader", { name: "ID" }).should("be.visible");
  });

  it("should be possible to extract columns from a summarized table", () => {
    createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          limit: 1,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
      },
      {
        visitQuestion: true,
      },
    );
    extractColumnAndCheck({
      column: "Created At: Month",
      option: "Month of year",
    });

    cy.findAllByRole("columnheader", { name: "Month of year" }).should(
      "be.visible",
    );
  });

  it("should be possible to extract columns from table with breakouts", () => {
    createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
      },
      {
        visitQuestion: true,
      },
    );

    extractColumnAndCheck({
      column: "Created At: Month",
      option: "Month of year",
    });

    cy.findAllByRole("columnheader", { name: "Month of year" }).should(
      "be.visible",
    );
  });
});

function extractColumnAndCheck({
  column,
  option,
  newColumn = option,
  value,
  example,
}: {
  column: string;
  option: string;
  value?: string;
  example?: string;
  newColumn?: string;
}) {
  const requestAlias = _.uniqueId("dataset");
  cy.intercept("POST", "/api/dataset").as(requestAlias);
  cy.findByLabelText("Add column").click();

  popover().findByText("Extract part of column").click();
  popover().findAllByText(column).first().click();

  if (example) {
    popover().findByText(option).parent().should("contain", example);
  }

  popover().findByText(option).click();

  cy.wait(`@${requestAlias}`);

  cy.findAllByRole("columnheader")
    .last()
    .should("have.text", newColumn)
    .should("be.visible");

  cy.findAllByRole("columnheader").last().should("have.text", newColumn);
  if (value) {
    cy.findByRole("gridcell", { name: value }).should("be.visible");
  }
}
