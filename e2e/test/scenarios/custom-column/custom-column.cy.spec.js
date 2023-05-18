import {
  restore,
  popover,
  summarize,
  visualize,
  openOrdersTable,
  openPeopleTable,
  visitQuestionAdhoc,
  enterCustomColumnDetails,
  getBinningButtonForDimension,
  filter,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > custom column", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsNormalUser();
  });

  it("can create a custom column (metabase#13241)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.icon("add_data").click();

    enterCustomColumnDetails({ formula: "1 + 1", name: "Math" });
    cy.button("Done").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.get(".Visualization").contains("Math");
  });

  it("should allow choosing a binning for a numeric custom column", () => {
    openOrdersTable({ mode: "notebook" });
    cy.icon("add_data").click();

    enterCustomColumnDetails({
      formula: "[Product.Price] / 2",
      name: "Half Price",
    });
    cy.button("Done").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize").click();
    popover().findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().findByText("Half Price").click();

    cy.get("[data-testid='step-summarize-0-0']")
      .findByText("Half Price")
      .click();
    getBinningButtonForDimension({
      name: "Half Price",
    }).click();

    popover().last().findByText("10 bins").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Half Price: 10 bins").should("be.visible");
  });

  it("should allow choosing a temporal unit for a date/time custom column", () => {
    openOrdersTable({ mode: "notebook" });
    cy.icon("add_data").click();

    enterCustomColumnDetails({
      formula: "[Product.Created At]",
      name: "Product Date",
    });
    cy.button("Done").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize").click();
    popover().findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().findByText("Product Date").click();

    cy.get("[data-testid='step-summarize-0-0']")
      .findByText("Product Date")
      .click();
    getBinningButtonForDimension({
      name: "Product Date",
    }).click();

    popover().last().findByText("Month of Year").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product Date: Month of year").should("be.visible");
  });

  it("should allow choosing a binning for a coordinate custom column", () => {
    openPeopleTable({ mode: "notebook" });
    cy.icon("add_data").click();

    enterCustomColumnDetails({
      formula: "[Latitude]",
      name: "UserLAT",
    });
    cy.button("Done").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize").click();
    popover().findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().findByText("UserLAT").click();

    cy.get("[data-testid='step-summarize-0-0']").findByText("UserLAT").click();
    getBinningButtonForDimension({
      name: "UserLAT",
    }).click();

    popover().last().findByText("Bin every 10 degrees").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("UserLAT: 10°").should("be.visible");
  });

  // flaky test (#19454)
  it.skip("should show info popovers when hovering over custom column dimensions in the summarize sidebar", () => {
    openOrdersTable({ mode: "notebook" });
    cy.icon("add_data").click();

    enterCustomColumnDetails({ formula: "1 + 1", name: "Math" });
    cy.button("Done").click();

    visualize();

    summarize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Group by").parent().findByText("Math").trigger("mouseenter");

    popover().contains("Math");
    popover().contains("No description");
  });

  it("can create a custom column with an existing column name", () => {
    const customFormulas = [
      {
        formula: "[Quantity] * 2",
        name: "Double Qt",
      },
      {
        formula: "[Quantity] * [Product.Price]",
        name: "Sum Total",
      },
    ];

    customFormulas.forEach(({ formula, name }) => {
      openOrdersTable({ mode: "notebook" });
      cy.icon("add_data").click();

      enterCustomColumnDetails({ formula, name });
      cy.button("Done").click();

      visualize();

      cy.get(".Visualization").contains(name);
    });
  });

  it("should create custom column with fields from aggregated data (metabase#12762)", () => {
    openOrdersTable({ mode: "notebook" });

    summarize({ mode: "notebook" });

    popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Subtotal").click();
    });

    // TODO: There isn't a single unique parent that can be used to scope this icon within
    // (a good candidate would be `.NotebookCell`)
    cy.icon("add")
      .last() // This is brittle.
      .click();

    popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();

    // Add custom column based on previous aggregates
    const columnName = "MegaTotal";
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();

    enterCustomColumnDetails({
      formula: "[Sum of Subtotal] + [Sum of Total]",
      name: columnName,
    });
    cy.button("Done").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
    // This is a pre-save state of the question but the column name should appear
    // both in tabular and graph views (regardless of which one is currently selected)
    cy.get(".Visualization").contains(columnName);
  });

  it("should not return same results for columns with the same name (metabase#12649)", () => {
    openOrdersTable({ mode: "notebook" });
    // join with Products
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products").click();

    // add custom column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    enterCustomColumnDetails({ formula: "1 + 1", name: "x" });
    cy.button("Done").click();

    visualize();

    cy.log(
      "**Fails in 0.35.0, 0.35.1, 0.35.2, 0.35.4 and the latest master (2020-10-21)**",
    );
    cy.log("Works in 0.35.3");
    // ID should be "1" but it is picking the product ID and is showing "14"
    cy.get(".TableInteractive-cellWrapper--firstColumn")
      .eq(1) // the second cell from the top in the first column (the first one is a header cell)
      .findByText("1");
  });

  it("should be able to use custom expression after aggregation (metabase#13857)", () => {
    const CE_NAME = "13857_CE";
    const CC_NAME = "13857_CC";

    cy.signInAsAdmin();

    cy.createQuestion(
      {
        name: "13857",
        query: {
          expressions: {
            [CC_NAME]: ["*", ["field-literal", CE_NAME, "type/Float"], 1234],
          },
          "source-query": {
            aggregation: [
              [
                "aggregation-options",
                ["*", 1, 1],
                { name: CE_NAME, "display-name": CE_NAME },
              ],
            ],
            breakout: [
              ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
            ],
            "source-table": ORDERS_ID,
          },
        },
      },
      { visitQuestion: true },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(CC_NAME);
  });

  it("should work with implicit joins (metabase#14080)", () => {
    const CC_NAME = "OneisOne";
    cy.signInAsAdmin();

    cy.createQuestion(
      {
        name: "14080",
        query: {
          "source-table": ORDERS_ID,
          expressions: { [CC_NAME]: ["*", 1, 1] },
          aggregation: [
            [
              "distinct",
              [
                "fk->",
                ["field-id", ORDERS.PRODUCT_ID],
                ["field-id", PRODUCTS.ID],
              ],
            ],
            ["sum", ["expression", CC_NAME]],
          ],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"],
          ],
        },
        display: "line",
      },
      { visitQuestion: true },
    );

    cy.log("Regression since v0.37.1 - it works on v0.37.0");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(`Sum of ${CC_NAME}`);
    cy.get(".Visualization .dot").should("have.length.of.at.least", 8);
  });

  it.skip("should create custom column after aggregation with 'cum-sum/count' (metabase#13634)", () => {
    cy.createQuestion(
      {
        name: "13634",
        query: {
          expressions: { "Foo Bar": ["+", 57910, 1] },
          "source-query": {
            aggregation: [["cum-count"]],
            breakout: [
              ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
            ],
            "source-table": ORDERS_ID,
          },
        },
      },
      { visitQuestion: true },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("13634");

    cy.log("Reported failing in v0.34.3, v0.35.4, v0.36.8.2, v0.37.0.2");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo Bar");
    cy.findAllByText("57911");
  });

  it("should not be dropped if filter is changed after aggregation (metaabase#14193)", () => {
    const CC_NAME = "Double the fun";

    cy.createQuestion(
      {
        name: "14193",
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            filter: [">", ["field-id", ORDERS.SUBTOTAL], 0],
            aggregation: [["sum", ["field-id", ORDERS.TOTAL]]],
            breakout: [
              ["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"],
            ],
          },
          expressions: {
            [CC_NAME]: ["*", ["field-literal", "sum", "type/Float"], 2],
          },
        },
      },
      { visitQuestion: true },
    );
    // Test displays collapsed filter - click on number 1 to expand and show the filter name
    cy.icon("filter").parent().contains("1").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Subtotal is greater than 0/i)
      .parent()
      .find(".Icon-close")
      .click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(CC_NAME);
  });

  it("should handle identical custom column and table column names (metabase#14255)", () => {
    // Uppercase is important for this reproduction on H2
    const CC_NAME = "CATEGORY";

    cy.createQuestion(
      {
        name: "14255",
        query: {
          "source-table": PRODUCTS_ID,
          expressions: {
            [CC_NAME]: ["concat", ["field-id", PRODUCTS.CATEGORY], "2"],
          },
          aggregation: [["count"]],
          breakout: [["expression", CC_NAME]],
        },
      },
      { visitQuestion: true },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(CC_NAME);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Gizmo2");
  });

  it.skip("should drop custom column (based on a joined field) when a join is removed (metabase#14775)", () => {
    const CE_NAME = "Rounded price";

    cy.createQuestion({
      name: "14775",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", ORDERS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
        expressions: {
          [CE_NAME]: [
            "ceil",
            ["joined-field", "Products", ["field-id", PRODUCTS.PRICE]],
          ],
        },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });

    // Remove join
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data")
      .parent()
      .find(".Icon-close")
      .click({ force: true }); // x is hidden and hover doesn't work so we have to force it
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").should("not.exist");

    cy.log("Reported failing on 0.38.1-SNAPSHOT (6d77f099)");
    cy.get("[class*=NotebookCellItem]").contains(CE_NAME).should("not.exist");

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });

  it("should handle using `case()` when referencing the same column names (metabase#14854)", () => {
    const CC_NAME = "CE with case";

    visitQuestionAdhoc(
      {
        dataset_query: {
          type: "query",
          query: {
            "source-table": ORDERS_ID,
            expressions: {
              [CC_NAME]: [
                "case",
                [
                  [
                    [">", ["field", ORDERS.DISCOUNT, null], 0],
                    ["field", ORDERS.CREATED_AT, null],
                  ],
                ],
                {
                  default: [
                    "field",
                    PRODUCTS.CREATED_AT,
                    { "source-field": ORDERS.PRODUCT_ID },
                  ],
                },
              ],
            },
          },
          database: SAMPLE_DB_ID,
        },
        display: "table",
      },
      { callback: xhr => expect(xhr.response.body.error).not.to.exist },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(CC_NAME);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });

  it("should handle brackets in the name of the custom column (metabase#15316)", () => {
    cy.createQuestion({
      name: "15316",
      query: {
        "source-table": ORDERS_ID,
        expressions: { "MyCC [2021]": ["+", 1, 1] },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sum of ...").click();
    popover().findByText("MyCC [2021]").click();
    cy.findAllByTestId("notebook-cell-item")
      .contains("Sum of MyCC [2021]")
      .click();
    popover().within(() => {
      cy.icon("chevronleft").click();
      cy.findByText("Custom Expression").click();
    });
    cy.get(".ace_line").contains("Sum([MyCC \\[2021\\]]");
  });

  it.skip("should work with `isNull` function (metabase#15922)", () => {
    openOrdersTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    enterCustomColumnDetails({
      formula: `isnull([Discount])`,
      name: "No discount",
    });
    cy.button("Done").click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No discount");
  });

  it("should be able to add a date range filter to a custom column", () => {
    visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          expressions: { CustomDate: ["field", ORDERS.CREATED_AT, null] },
        },
      },
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("CustomDate").click();

    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Specific dates...").click();
      enterDateFilter("12/10/2018", 0);
      enterDateFilter("01/05/2019", 1);
      cy.button("Add filter").click();
    });

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 463 rows").should("be.visible");
  });

  it("should work with relative date filter applied to a custom column (metabase#16273)", () => {
    openOrdersTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();

    enterCustomColumnDetails({
      formula: `case([Discount] > 0, [Created At], [Product → Created At])`,
      name: "MiscDate",
    });

    cy.button("Done").click();

    filter({ mode: "notebook" });
    popover().contains("MiscDate").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Relative dates...").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Past").click();
    // The popover shows up with the default value selected - previous 30 days.
    // Since we don't have any orders in the Sample Database for that period, we have to change it to the previous 30 years.
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("days").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("years").click();
    cy.button("Add filter").click();

    visualize(({ body }) => {
      expect(body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("MiscDate Previous 30 Years"); // Filter name
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("MiscDate"); // Column name
  });

  it("should allow switching focus with Tab", () => {
    openOrdersTable({ mode: "notebook" });
    cy.icon("add_data").click();

    enterCustomColumnDetails({ formula: "1 + 2" });

    // next focus: the textbox for the name
    cy.realPress("Tab");
    cy.focused().should("have.attr", "value").and("eq", "");
    cy.focused()
      .should("have.attr", "placeholder")
      .and("eq", "Something nice and descriptive");

    // Shift+Tab and we're back at the editor
    cy.realPress(["Shift", "Tab"]);
    cy.focused().should("have.attr", "class").and("eq", "ace_text-input");
  });

  it("should allow tabbing away from, then back to editor, while formatting expression and placing caret after reformatted expression", () => {
    openOrdersTable({ mode: "notebook" });
    cy.icon("add_data").click();

    enterCustomColumnDetails({ formula: "1+1" });

    cy.realPress("Tab");
    cy.realPress(["Shift", "Tab"]);

    // `1+1` (3 chars) is reformatted to `1 + 1` (5 chars)
    cy.findByDisplayValue("1 + 1").type("2");

    // Fix needed will prevent display value from being `1 +2 1`.
    // That's because the caret position after refocusing on textarea
    // would still be after the 3rd character
    cy.findByDisplayValue("1 + 12");
  });

  it("should allow choosing a suggestion with Tab", () => {
    openOrdersTable({ mode: "notebook" });
    cy.icon("add_data").click();

    enterCustomColumnDetails({ formula: "[" });

    // Suggestion popover shows up and this select the first one ([Created At])
    cy.realPress("Tab");

    // Focus remains on the expression editor
    cy.focused().should("have.attr", "class").and("eq", "ace_text-input");

    // Tab to focus on the name box
    cy.realPress("Tab");
    cy.focused().should("have.attr", "value").and("eq", "");
    cy.focused()
      .should("have.attr", "placeholder")
      .and("eq", "Something nice and descriptive");

    // Shift+Tab and we're back at the editor
    cy.realPress(["Shift", "Tab"]);
    cy.focused().should("have.attr", "class").and("eq", "ace_text-input");
  });
});

const enterDateFilter = (value, index = 0) => {
  cy.findAllByTestId("specific-date-picker")
    .eq(index)
    .findByRole("textbox")
    .clear()
    .type(value)
    .blur();
};
