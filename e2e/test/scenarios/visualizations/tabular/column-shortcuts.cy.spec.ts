import _ from "underscore";

const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE, PEOPLE_ID, ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("extract shortcut", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();

    cy.signInAsAdmin();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should add an email expression and disable the scroll behaviour after it has been rendered", () => {
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
      option: "Domain",
      value: "yahoo",
      example: "example, online",
    });
    H.expectUnstructuredSnowplowEvent({
      event: "column_extract_via_plus_modal",
      custom_expressions_used: ["domain"],
      database_id: SAMPLE_DB_ID,
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

  cy.findByRole("columnheader", { name: newColumn }).should("exist");

  // With many columns, the "Add column" button can cover the last header,
  // so the visible value cell shows that the table scrolled to the new column.
  if (!value) {
    cy.findByRole("columnheader", { name: newColumn }).should("be.visible");
  }

  if (value) {
    cy.findByRole("gridcell", { name: value }).should("be.visible");
  }
}

describe(
  "extract shortcut from the column header",
  { viewportWidth: 1600 },
  () => {
    beforeEach(() => {
      H.restore();
      H.resetSnowplow();
      cy.signInAsAdmin();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should use current user locale for string expressions", () => {
      cy.request("GET", "/api/user/current").then(({ body: user }) => {
        cy.request("PUT", `/api/user/${user.id}`, { locale: "en-ZZ" });
      });
      H.openOrdersTable({ limit: 1 });
      extractColumnFromHeaderAndCheck({
        column: "Created At",
        option: "[zz] Day of week",
        // dayjs has no en-ZZ locale, so it falls back to English day names
        value: "Friday",
        extraction: "[zz] Extract day, month…",
      });
    });

    it("should create a snowplow event for the column extraction action and allow editing and renaming the expression in the notebook editor", () => {
      H.openOrdersTable({ limit: 1 });

      extractColumnFromHeaderAndCheck({
        column: "Created At",
        option: "Year",
        value: "2,028",
        extraction: "Extract day, month…",
      });

      H.expectUnstructuredSnowplowEvent({
        event: "column_extract_via_column_header",
        custom_expressions_used: ["get-year"],
        database_id: SAMPLE_DB_ID,
      });

      cy.log("Modify the expression in the notebook editor");
      H.openNotebook();
      H.getNotebookStep("expression").findByText("Year").click();
      H.enterCustomColumnDetails({
        name: "custom formula",
        formula: "year([Created At]) + 2",
        format: true,
      });
      H.popover().button("Update").should("not.be.disabled").click();
      H.visualize();
      H.tableHeaderColumn("custom formula").should("be.visible");
      cy.findByRole("gridcell", { name: "2,030" }).should("be.visible");
    });
  },
);

function extractColumnFromHeaderAndCheck({
  column,
  option,
  newColumn = option,
  extraction,
  value,
}: {
  column: string;
  option: string;
  newColumn?: string;
  extraction: string;
  value: string;
}) {
  const requestAlias = _.uniqueId("dataset");
  cy.intercept("POST", "/api/dataset").as(requestAlias);
  H.tableHeaderClick(column);

  H.popover().findByText(extraction).click();
  H.popover().findByText(option).click();
  cy.wait(`@${requestAlias}`);

  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByRole("columnheader")
    .last()
    .scrollIntoView()
    .should("have.text", newColumn)
    .and("be.visible");

  cy.findByRole("gridcell", { name: value }).should("be.visible");
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

  it("should combine columns from the column header", () => {
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

    H.tableHeaderClick("Email");
    H.popover().findByText("Combine columns").click();
    H.popover()
      .findByTestId("combine-example")
      .should("contain", "email@example.com12345");
    H.popover().findByText("Done").click();

    cy.findAllByTestId("header-cell")
      .should("have.length", 3)
      .last()
      .should("have.text", "Combined Email, ID");
    cy.findByRole("gridcell", { name: "borer-hudson@yahoo.com1" }).should(
      "be.visible",
    );

    H.expectUnstructuredSnowplowEvent({
      event: "column_combine_via_column_header",
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
