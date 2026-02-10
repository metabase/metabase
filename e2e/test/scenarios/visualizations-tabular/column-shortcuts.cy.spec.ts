import _ from "underscore";

const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID, ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

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

describe("extract shortcut", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();

    cy.signInAsAdmin();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("date columns", () => {
    describe("should add a date expression for each option", () => {
      DATE_CASES.forEach(({ option, value, example, expressions }) => {
        it(option, () => {
          H.openOrdersTable({ limit: 1 });
          extractColumnAndCheck({
            column: "Created At",
            option,
            value,
            example,
          });
          H.expectUnstructuredSnowplowEvent({
            event: "column_extract_via_plus_modal",
            custom_expressions_used: expressions,
            database_id: SAMPLE_DB_ID,
          });
        });
      });
    });

    it("should handle duplicate expression names", () => {
      H.openOrdersTable({ limit: 1 });
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
      H.openOrdersTable({ limit: 1 });
      extractColumnAndCheck({
        column: "Created At",
        option: "Year",
        value: "2,025",
      });
      H.openNotebook();
      H.getNotebookStep("expression").findByText("Year").click();
      H.enterCustomColumnDetails({
        name: "custom formula",
        formula: "year([Created At]) + 2",
        blur: true,
      });
      H.popover().button("Update").should("not.be.disabled").click();
      H.visualize();
      cy.findByRole("gridcell", { name: "2,027" }).should("be.visible");
    });
  });

  describe("email columns", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    EMAIL_CASES.forEach(({ option, value, example, expressions }) => {
      it(option, () => {
        H.createQuestion(
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
        H.expectUnstructuredSnowplowEvent({
          event: "column_extract_via_plus_modal",
          custom_expressions_used: expressions,
          database_id: SAMPLE_DB_ID,
        });
      });
    });
  });

  describe("url columns", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      // Make the Email column a URL column for these tests, to avoid having to create a new model
      cy.request("PUT", `/api/field/${PEOPLE.EMAIL}`, {
        semantic_type: "type/URL",
      });
    });

    URL_CASES.forEach(({ option, value, example, expressions }) => {
      it(option, () => {
        H.createQuestion(
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
        H.expectUnstructuredSnowplowEvent({
          event: "column_extract_via_plus_modal",
          custom_expressions_used: expressions,
          database_id: SAMPLE_DB_ID,
        });
      });
    });
  });

  it("should disable the scroll behaviour after it has been rendered", () => {
    H.createQuestion(
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

    H.tableInteractiveScrollContainer().scrollTo("left", {
      duration: 2000 / 60,
    });

    H.tableHeaderClick("ID");

    // Change sort direction
    H.popover().findAllByRole("button").first().click();

    // ID should still be visible (ie. no scrolling to the end should have happened)
    cy.findAllByRole("columnheader").contains("ID").should("be.visible");
  });

  it("should be possible to extract columns from a summarized table", () => {
    H.createQuestion(
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
    H.createQuestion(
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

  H.popover().findByText("Extract part of column").click();
  H.popover().findAllByText(column).first().click();

  if (example) {
    H.popover().findByText(option).parent().should("contain", example);
  }

  H.popover().findByText(option).click();

  cy.wait(`@${requestAlias}`);

  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByRole("columnheader")
    .last()
    .should("have.text", newColumn)
    .should("be.visible");

  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByRole("columnheader").last().should("have.text", newColumn);
  if (value) {
    cy.findByRole("gridcell", { name: value }).should("be.visible");
  }
}

describe("scenarios > visualizations > combine shortcut", () => {
  function combineColumns({
    columns,
    example,
    newColumn,
    newValue,
  }: {
    columns: string[];
    example: string;
    newColumn: string;
    newValue?: string;
  }) {
    const requestAlias = _.uniqueId("dataset");
    cy.intercept("POST", "/api/dataset").as(requestAlias);
    cy.findByLabelText("Add column").click();

    H.popover().findByText("Combine columns").click();
    for (const [index, column] of columns.entries()) {
      selectColumn(index, column);
    }

    if (example) {
      H.popover().findByTestId("combine-example").should("have.text", example);
    }

    H.popover().button("Done").click();

    cy.wait(`@${requestAlias}`);

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByRole("columnheader")
      .last()
      .should("have.text", newColumn)
      .should("be.visible");

    if (newValue) {
      cy.findByRole("gridcell", { name: newValue }).should("be.visible");
    }
  }

  function selectColumn(index: number, name: string) {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover().findAllByTestId("column-input").eq(index).click();
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover().last().findByText(name).click();
  }

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.resetSnowplow();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should be possible add a new column through the combine columns shortcut", () => {
    H.createQuestion(
      {
        query: {
          "source-table": PEOPLE_ID,
          limit: 1,
          fields: [
            ["field", PEOPLE.ID, null],
            ["field", PEOPLE.EMAIL, null],
          ],
        },
      },
      {
        visitQuestion: true,
      },
    );

    combineColumns({
      columns: ["Email", "ID"],
      newColumn: "Combined Email, ID",
      example: "email@example.com12345",
      newValue: "borer-hudson@yahoo.com1",
    });

    H.expectUnstructuredSnowplowEvent({
      event: "column_combine_via_plus_modal",
      custom_expressions_used: ["concat"],
      database_id: SAMPLE_DB_ID,
    });
  });

  it("should allow combining columns when aggregating", function () {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          limit: 1,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
          ],
        },
      },
      {
        visitQuestion: true,
      },
    );

    H.tableInteractive().should("exist");
    combineColumns({
      columns: ["Created At: Hour of day", "Count"],
      newColumn: "Combined Created At: Hour of day, Count",
      example: "2042-01-01 12:34:56.789 123",
      newValue: "0 766",
    });
  });

  it("should allow combining columns on a table with just breakouts", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          limit: 1,
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
            [
              "field",
              PRODUCTS.CATEGORY,
              { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
            ],
          ],
        },
      },
      {
        visitQuestion: true,
      },
    );

    H.tableInteractive().should("exist");
    combineColumns({
      columns: ["Created At: Hour of day", "Product → Category"],
      newColumn: "Combined Created At: Hour of day, Product → Category",
      example: "2042-01-01 12:34:56.789 text",
      newValue: "0 Doohickey",
    });
  });
});
