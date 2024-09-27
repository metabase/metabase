import _ from "underscore";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  describeWithSnowplow,
  enterCustomColumnDetails,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  getNotebookStep,
  openNotebook,
  openOrdersTable,
  openPeopleTable,
  popover,
  resetSnowplow,
  restore,
  visitQuestion,
  visualize,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const DATE_CASES = [
  {
    option: "Hour of day",
    value: "21",
    example: "0, 1",
  },
  {
    option: "Day of month",
    value: "11",
    example: "1, 2",
  },
  {
    option: "Day of week",
    value: "Tuesday",
    example: "Monday, Tuesday",
  },
  {
    option: "Month of year",
    value: "Feb",
    example: "Jan, Feb",
  },
  {
    option: "Quarter of year",
    value: "Q1",
    example: "Q1, Q2",
  },
  {
    option: "Year",
    value: "2,025",
    example: "2023, 2024",
  },
];

const EMAIL_CASES = [
  {
    option: "Domain",
    value: "yahoo",
    example: "example, online",
  },
  {
    option: "Host",
    value: "yahoo.com",
    example: "example.com, online.com",
  },
];

const URL_CASES = [
  {
    option: "Domain",
    value: "yahoo",
    example: "example, online",
  },
  {
    option: "Subdomain",
    value: "",
    example: "www, maps",
  },
  {
    option: "Host",
    value: "yahoo.com",
    example: "example.com, online.com",
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

describeWithSnowplow("extract action", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("date columns", () => {
    describe("should add a date expression for each option", () => {
      DATE_CASES.forEach(({ option, value, example }) => {
        it(option, () => {
          openOrdersTable({ limit: 1 });
          extractColumnAndCheck({
            column: "Created At",
            option,
            value,
            example,
            extraction: "Extract day, month…",
          });
        });
      });
    });

    describe("should add a new column after the selected column", () => {
      it("ad-hoc question", () => {
        openOrdersTable();
        extractColumnAndCheck({
          column: "Created At",
          option: "Year",
          extraction: "Extract day, month…",
        });
      });

      it("saved question without viz settings", () => {
        visitQuestion(ORDERS_QUESTION_ID);
        extractColumnAndCheck({
          column: "Created At",
          option: "Year",
          extraction: "Extract day, month…",
        });
      });

      it("saved question with viz settings", () => {
        cy.createQuestion(
          {
            query: {
              "source-table": ORDERS_ID,
              fields: [
                ["field", ORDERS.ID, { "base-type": "type/BigInteger" }],
                ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
                ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }],
              ],
            },
            visualization_settings: {
              "table.columns": [
                {
                  name: "ID",
                  fieldRef: ["field", ORDERS.ID, null],
                  enabled: true,
                },
                {
                  name: "CREATED_AT",
                  fieldRef: [
                    "field",
                    ORDERS.CREATED_AT,
                    {
                      "temporal-unit": "default",
                    },
                  ],
                  enabled: true,
                },
                {
                  name: "QUANTITY",
                  fieldRef: ["field", ORDERS.QUANTITY, null],
                  enabled: true,
                },
              ],
            },
          },
          { visitQuestion: true },
        );
        extractColumnAndCheck({
          column: "Created At",
          option: "Year",
          extraction: "Extract day, month…",
        });
      });
    });

    it("should add an expression based on a breakout column", () => {
      cy.createQuestion(DATE_QUESTION, { visitQuestion: true });
      extractColumnAndCheck({
        column: "Created At: Month",
        option: "Month of year",
        value: "Apr",
        extraction: "Extract day, month…",
      });
    });

    it("should add an expression based on an aggregation column", () => {
      cy.createQuestion(DATE_QUESTION, { visitQuestion: true });
      extractColumnAndCheck({
        column: "Min of Created At",
        option: "Year",
        value: "2,022",
        extraction: "Extract day, month…",
      });
    });

    it("should handle duplicate expression names", () => {
      openOrdersTable({ limit: 1 });
      extractColumnAndCheck({
        column: "Created At",
        option: "Hour of day",
        newColumn: "Hour of day",
        extraction: "Extract day, month…",
      });
      extractColumnAndCheck({
        column: "Created At",
        option: "Hour of day",
        newColumn: "Hour of day_2",
        extraction: "Extract day, month…",
      });
    });

    it("should be able to modify the expression in the notebook editor", () => {
      openOrdersTable({ limit: 1 });
      extractColumnAndCheck({
        column: "Created At",
        option: "Year",
        value: "2,025",
        extraction: "Extract day, month…",
      });
      openNotebook();
      getNotebookStep("expression").findByText("Year").click();
      enterCustomColumnDetails({ formula: "year([Created At]) + 2" });
      popover().button("Update").click();
      visualize();
      cy.findByRole("gridcell", { name: "2,027" }).should("be.visible");
    });

    it("should use current user locale for string expressions", () => {
      cy.request("GET", "/api/user/current").then(({ body: user }) => {
        cy.request("PUT", `/api/user/${user.id}`, { locale: "de" });
      });
      openOrdersTable({ limit: 1 });
      extractColumnAndCheck({
        column: "Created At",
        option: "Tag der Woche",
        value: "Dienstag",
        extraction: "Extract day, month…",
      });
    });
  });

  describe("email columns", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    EMAIL_CASES.forEach(({ option, value, example }) => {
      it(option, () => {
        openPeopleTable({ limit: 1 });
        extractColumnAndCheck({
          column: "Email",
          option,
          value,
          example,
          extraction: "Extract domain, host…",
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

    URL_CASES.forEach(({ option, value, example }) => {
      it(option, () => {
        openPeopleTable({ limit: 1 });

        extractColumnAndCheck({
          column: "Email",
          option,
          value,
          example,
          extraction: "Extract domain, subdomain…",
        });
      });
    });
  });
});

function extractColumnAndCheck({
  column,
  option,
  newColumn = option,
  extraction,
  value,
  example,
}) {
  const requestAlias = _.uniqueId("dataset");
  cy.intercept("POST", "/api/dataset").as(requestAlias);
  cy.findByRole("columnheader", { name: column }).click();
  popover().findByText(extraction).click();
  cy.wait(1);

  if (example) {
    popover().findByText(option).should("contain", example);
  }

  popover().findByText(option).click();
  cy.wait(`@${requestAlias}`);

  cy.findAllByRole("columnheader")
    .last()
    .should("have.text", newColumn)
    .should("be.visible");

  if (value) {
    cy.findByRole("gridcell", { name: value }).should("be.visible");
  }
}

describeWithSnowplow("extract action", () => {
  beforeEach(() => {
    restore();
    resetSnowplow();
    cy.signInAsAdmin();
  });

  afterEach(() => {
    expectNoBadSnowplowEvents();
  });

  it("should create a snowplow event for the column extraction action", () => {
    openOrdersTable({ limit: 1 });

    cy.wait(1);

    extractColumnAndCheck({
      column: "Created At",
      option: "Year",
      value: "2,025",
      extraction: "Extract day, month…",
    });

    expectGoodSnowplowEvent({
      event: "column_extract_via_column_header",
      custom_expressions_used: ["get-year"],
      database_id: SAMPLE_DB_ID,
    });
  });
});
