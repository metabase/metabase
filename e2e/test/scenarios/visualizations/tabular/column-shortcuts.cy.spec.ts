import _ from "underscore";

const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID, ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

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
    value: "Friday",
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
    value: "2,028",
    example: "2026, 2027",
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

describe("column header extraction", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();

    cy.signInAsAdmin();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("date columns", () => {
    it("should add a date expression for each option", () => {
      H.openOrdersTable({ limit: 1 });
      DATE_CASES.forEach(({ option, value, example, expressions }) => {
        extractColumnAndCheck({
          column: "Created At",
          option,
          value,
          example,
        });
        H.expectUnstructuredSnowplowEvent({
          event: "column_extract_via_column_header",
          custom_expressions_used: expressions,
          database_id: SAMPLE_DB_ID,
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
  });

  it("should add a url expression for each option", () => {
    // Make the Email column a URL column for this test, to avoid having to create a new model
    cy.request("PUT", `/api/field/${PEOPLE.EMAIL}`, {
      semantic_type: "type/URL",
    });

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

    URL_CASES.forEach(({ option, value, example, expressions }) => {
      extractColumnAndCheck({
        column: "Email",
        extraction: "Extract domain, subdomain…",
        option,
        value,
        example,
      });
      H.expectUnstructuredSnowplowEvent({
        event: "column_extract_via_column_header",
        custom_expressions_used: expressions,
        database_id: SAMPLE_DB_ID,
      });
    });
  });

  it("should add an email expression for each option and disable the scroll behaviour after it has been rendered", () => {
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

    EMAIL_CASES.forEach(({ option, value, example, expressions }) => {
      extractColumnAndCheck({
        column: "Email",
        extraction: "Extract domain, host…",
        option,
        value,
        example,
      });
      H.expectUnstructuredSnowplowEvent({
        event: "column_extract_via_column_header",
        custom_expressions_used: expressions,
        database_id: SAMPLE_DB_ID,
      });
    });

    H.tableInteractiveScrollContainer().scrollTo("left", {
      duration: 2000 / 60,
    });

    H.tableHeaderClick("ID");

    cy.intercept("POST", "/api/dataset").as("sortedDataset");
    // Change sort direction
    H.popover().findAllByRole("button").first().click();
    cy.wait("@sortedDataset");

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
  });
});

function extractColumnAndCheck({
  column,
  extraction = "Extract day, month…",
  option,
  newColumn = option,
  value,
  example,
}: {
  column: string;
  extraction?: string;
  option: string;
  value?: string;
  example?: string;
  newColumn?: string;
}) {
  const requestAlias = _.uniqueId("dataset");
  cy.intercept("POST", "/api/dataset").as(requestAlias);
  H.tableHeaderClick(column);
  H.popover().findByText(extraction).click();

  if (example) {
    H.popover().findByText(option).parent().should("contain", example);
  }

  H.popover().findByText(option).click();

  cy.wait(`@${requestAlias}`);

  cy.findByRole("columnheader", { name: newColumn }).should("exist");

  // With many columns, the "Add column" button can cover the last header,
  // so the visible value cell shows that the table scrolled to the new column.
  if (!value) {
    cy.findByRole("columnheader", { name: newColumn }).should("be.visible");
  }

  if (value === "") {
    H.tableInteractiveBody()
      .find(`[data-column-id="${newColumn}"]`)
      .should("have.text", "");
  } else if (value) {
    cy.findByRole("gridcell", { name: value }).should("be.visible");
  }
}

describe("scenarios > visualizations > column header combination", () => {
  function combineColumns({
    columns,
    example,
    newColumn,
    newValue,
  }: {
    columns: [string, ...string[]];
    example: string;
    newColumn: string;
    newValue?: string;
  }) {
    const requestAlias = _.uniqueId("dataset");
    cy.intercept("POST", "/api/dataset").as(requestAlias);
    H.tableHeaderClick(columns[0]);

    H.popover().findByText("Combine columns").click();
    for (const [index, column] of columns.slice(1).entries()) {
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

  it("should combine columns from the column header and handle duplicate column names", () => {
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

    // Runs first: its gridcell check needs a single combined column.
    combineColumns({
      columns: ["Email", "ID"],
      newColumn: "Combined Email, ID",
      example: "email@example.com12345",
      newValue: "borer-hudson@yahoo.com1",
    });

    H.expectUnstructuredSnowplowEvent({
      event: "column_combine_via_column_header",
      custom_expressions_used: ["concat"],
      database_id: SAMPLE_DB_ID,
    });

    cy.log("Combine columns from the column header");
    H.tableHeaderClick("Email");
    H.popover().findByText("Combine columns").click();

    H.popover()
      .findByTestId("combine-example")
      .should("contain", "email@example.com12345");
    selectColumn(0, "Name");

    H.popover().within(() => {
      cy.findByText("Separated by (empty)").click();
      cy.findByLabelText("Separator").type("__");
      cy.findByTestId("combine-example").should(
        "have.text",
        "email@example.com__text",
      );

      cy.findByText("Add column").click();
      cy.findByTestId("combine-example").should(
        "have.text",
        "email@example.com__text__12345",
      );

      cy.findAllByLabelText("Separator")
        .should("have.length", 2)
        .last()
        .clear();
      cy.findByTestId("combine-example").should(
        "have.text",
        "email@example.com__text12345",
      );

      cy.findAllByLabelText("Separator")
        .should("have.length", 2)
        .last()
        .clear()
        .type("+");
      cy.findByTestId("combine-example").should(
        "have.text",
        "email@example.com__text+12345",
      );

      cy.findByText("Done").click();
    });

    cy.findAllByTestId("header-cell")
      .should("have.length", 4)
      .last()
      .should("have.text", "Combined Email, Name, ID");

    H.expectUnstructuredSnowplowEvent(
      {
        event: "column_combine_via_column_header",
        custom_expressions_used: ["concat"],
        database_id: SAMPLE_DB_ID,
      },
      2,
    );

    cy.log("Duplicate column names");
    H.tableHeaderClick("Email");
    H.popover().findByText("Combine columns").click();
    H.popover().findByText("Done").click();

    H.tableHeaderClick("Email");
    H.popover().findByText("Combine columns").click();
    H.popover().findByText("Done").click();

    cy.findByTestId("table-header").within(() => {
      cy.findByText("Combined Email, ID").should("be.visible");
      cy.findByText("Combined Email, ID_2").should("be.visible");
      cy.findByText("Combined Email, ID_3").should("be.visible");
    });
  });

  it("should allow combining columns when aggregating", function () {
    H.createQuestion(
      {
        query: {
          "source-table": PRODUCTS_ID,
          limit: 1,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
      },
      {
        visitQuestion: true,
      },
    );

    H.tableInteractive().should("be.visible");
    combineColumns({
      columns: ["Category", "Count"],
      newColumn: "Combined Category, Count",
      example: "text 123",
      newValue: "Doohickey 42",
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

    H.tableInteractive().should("be.visible");
    combineColumns({
      columns: ["Product → Category", "Created At: Hour of day"],
      newColumn: "Combined Product → Category, Created At: Hour of day",
      example: "text 2042-01-01 12:34:56.789",
      newValue: "Doohickey 0",
    });
  });
});
