const { H } = cy;
import { dedent } from "ts-dedent";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > custom column", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsNormalUser();
  });

  it("can see x-ray options when a custom column is present (#16680)", () => {
    H.createQuestion(
      {
        name: "16680",
        display: "line",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["expression", "TestColumn"],
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
          expressions: { TestColumn: ["+", 1, 1] },
        },
      },
      { visitQuestion: true },
    );
    H.cartesianChartCircle().eq(5).click();
    H.popover()
      .findByText(/Automatic Insights/i)
      .click();
    H.popover().findByText(/X-ray/i);
    H.popover()
      .findByText(/Compare to the rest/i)
      .click();
  });

  it("can create a custom column (metabase#13241)", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "1 + 1",
      name: "Math",
      format: true,
    });
    cy.button("Done").click();

    H.visualize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.findByTestId("query-visualization-root").contains("Math");
  });

  it("should not show default period in date column name (metabase#36631)", () => {
    const name = "Base question";
    H.createQuestion({ name, query: { "source-table": ORDERS_ID } });

    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalLevel(0).findByText("Our analytics").click();
      H.entityPickerModalLevel(1).findByText(name).click();
    });
    cy.button("Custom column").click();
    H.enterCustomColumnDetails({ formula: "[cre", blur: false });

    H.CustomExpressionEditor.completions()
      .should("be.visible")
      .and("contain.text", "Created At")
      .and("not.contain.text", "Default period");
  });

  it("should not show binning for a numeric custom column", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "[Product.Price] / 2",
      name: "Half Price",
    });
    cy.button("Done").click();

    cy.button("Summarize").click();
    H.popover().findByText("Count of rows").click();

    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();

    H.popover()
      .findByRole("option", { name: "Half Price" })
      .within(() => {
        cy.findByLabelText("Binning strategy").should("not.exist");
        cy.findByLabelText("Temporal bucket").should("not.exist");
      })
      .click();

    H.getNotebookStep("summarize")
      .findByText("Half Price")
      .should("be.visible");
  });

  it("should show temporal units for a date/time custom column", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "[Product.Created At]",
      name: "Product Date",
    });
    cy.button("Done").click();

    cy.button("Summarize").click();
    H.popover().findByText("Count of rows").click();

    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover()
      .findByRole("option", { name: "Product Date" })
      .within(() => {
        cy.findByLabelText("Binning strategy").should("not.exist");
        cy.findByLabelText("Temporal bucket").should("exist");
      })
      .click();

    H.getNotebookStep("summarize")
      .findByText("Product Date: Month")
      .should("be.visible");
  });

  it("should not show binning options for a coordinate custom column", () => {
    H.openPeopleTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "[Latitude]",
      name: "UserLAT",
    });
    cy.button("Done").click();

    cy.button("Summarize").click();
    H.popover().findByText("Count of rows").click();

    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    H.popover()
      .findByRole("option", { name: "UserLAT" })
      .within(() => {
        cy.findByLabelText("Binning strategy").should("not.exist");
        cy.findByLabelText("Temporal bucket").should("not.exist");
      })
      .click();

    H.getNotebookStep("summarize").findByText("UserLAT").should("be.visible");
  });

  // flaky test (#19454)
  it(
    "should show info popovers when hovering over custom column dimensions in the summarize sidebar",
    { tags: "@skip" },
    () => {
      H.openOrdersTable({ mode: "notebook" });
      cy.findByLabelText("Custom column").click();

      H.enterCustomColumnDetails({ formula: "1 + 1", name: "Math" });
      cy.button("Done").click();

      H.visualize();

      H.summarize();

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Group by")
        .parent()
        .findByText("Math")
        .trigger("mouseenter");

      H.popover().contains("Math");
      H.popover().contains("No description");
    },
  );

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
      H.openOrdersTable({ mode: "notebook" });
      cy.findByLabelText("Custom column").click();

      H.enterCustomColumnDetails({ formula, name });
      cy.button("Done").click();

      H.visualize();

      cy.findByTestId("query-visualization-root").contains(name);
    });
  });

  it("should create custom column with fields from aggregated data (metabase#12762)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.summarize({ mode: "notebook" });

    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Subtotal").click();
    });

    // TODO: There isn't a single unique parent that can be used to scope this icon within
    // (a good candidate would be `.NotebookCell`)
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.icon("add")
      .last() // This is brittle.
      .click();

    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();

    // Add custom column based on previous aggregates
    const columnName = "MegaTotal";
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "[Sum of Subtotal] + [Sum of Total]",
      name: columnName,
    });
    cy.button("Done").click();

    H.visualize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
    // This is a pre-save state of the question but the column name should appear
    // both in tabular and graph views (regardless of which one is currently selected)
    cy.findByTestId("query-visualization-root").contains(columnName);
  });

  it("should not return same results for columns with the same name (metabase#12649)", () => {
    H.openOrdersTable({ mode: "notebook" });
    // join with Products
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();

    H.miniPickerBrowseAll().click();
    H.entityPickerModal().within(() => {
      H.entityPickerModalLevel(0).findByText("Databases").click();
      H.entityPickerModalLevel(1).findByText("Sample Database").click();
      cy.findByText("Products").click();
    });

    // add custom column
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    H.enterCustomColumnDetails({ formula: "1 + 1", name: "x" });
    cy.button("Done").click();

    H.visualize();

    cy.log(
      "**Fails in 0.35.0, 0.35.1, 0.35.2, 0.35.4 and the latest master (2026-10-21)**",
    );
    cy.log("Works in 0.35.3");
    // ID should be "1" but it is picking the product ID and is showing "14"
    cy.get(".test-TableInteractive-cellWrapper--firstColumn")
      .eq(0)
      .findByText("1");
  });

  it("should be able to use custom expression after aggregation (metabase#13857)", () => {
    const CE_NAME = "13857_CE";
    const CC_NAME = "13857_CC";

    cy.signInAsAdmin();

    H.createQuestion(
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
                ["*", ["count"], 1],
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(CC_NAME);
  });

  it("should work with implicit joins (metabase#14080)", () => {
    const CC_NAME = "OneisOne";
    cy.signInAsAdmin();

    H.createQuestion(
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains(`Sum of ${CC_NAME}`);
    H.cartesianChartCircle().should("have.length.of.at.least", 8);
  });

  it("should create custom column after aggregation with 'cum-sum/count' (metabase#13634)", () => {
    H.createQuestion(
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("13634");

    cy.log("Reported failing in v0.34.3, v0.35.4, v0.36.8.2, v0.37.0.2");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Foo Bar");
    cy.findAllByText("57,911");
  });

  it("should not be dropped if filter is changed after aggregation (metaabase#14193)", () => {
    const CC_NAME = "Double the fun";

    H.createQuestion(
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
    cy.findByTestId("filters-visibility-control")
      .should("have.text", "1")
      .click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Subtotal is greater than 0/i)
      .parent()
      .find(".Icon-close")
      .click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(CC_NAME);
  });

  it("should handle identical custom column and table column names (metabase#14255)", () => {
    // Uppercase is important for this reproduction on H2
    const CC_NAME = "CATEGORY";

    H.createQuestion(
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(CC_NAME);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Gizmo2");
  });

  it("should drop custom column (based on a joined field) when a join is removed (metabase#14775)", () => {
    const CE_NAME = "Rounded price";

    H.createQuestion({
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
        limit: 5,
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
      cy.findByTestId("step-expression-0-0").contains(CE_NAME);
    });

    // Remove join
    cy.findByTestId("step-join-0-0").realHover().find(".Icon-close").click();
    cy.findByTestId("step-join-0-0").should("not.exist");

    cy.log("Reported failing on 0.38.1-SNAPSHOT (6d77f099)");
    cy.findByTestId("step-expression-0-0").should("not.exist");

    H.visualize((response) => {
      expect(response.body.error).to.not.exist;
    });

    cy.get("[data-testid=cell-data]").should("contain", "37.65");
    cy.findAllByTestId("header-cell").should("not.contain", CE_NAME);
  });

  it("should handle using `case()` when referencing the same column names (metabase#14854)", () => {
    const CC_NAME = "CE with case";

    H.visitQuestionAdhoc(
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
      { callback: (xhr) => expect(xhr.response.body.error).not.to.exist },
    );

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(CC_NAME);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });

  it("should handle brackets in the name of the custom column (metabase#15316)", () => {
    H.createQuestion({
      name: "15316",
      query: {
        "source-table": ORDERS_ID,
        expressions: { "MyCC [2027]": ["+", 1, 1] },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });
    H.summarize({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("MyCC [2027]").click();
    });
    cy.findAllByTestId("notebook-cell-item")
      .contains("Sum of MyCC [2027]")
      .click();
    H.popover().within(() => {
      cy.icon("chevronleft").click();
      cy.findByText("Custom Expression").click();
    });
    H.CustomExpressionEditor.value().should("equal", "Sum([MyCC \\[2027\\]])");
  });

  it("should work with `isNull` function (metabase#15922)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({
      formula: "isnull([Discount])",
      name: "No discount",
    });
    cy.button("Done").click();

    H.visualize((response) => {
      expect(response.body.error).to.not.exist;
    });

    cy.findAllByRole("gridcell").contains("37.65");
    cy.findAllByTestId("header-cell").contains("No discount");
  });

  it("should be able to add a date range filter to a custom column", () => {
    H.visitQuestionAdhoc({
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

    H.tableHeaderClick("CustomDate");

    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Fixed date range…").click();
      cy.findByLabelText("Start date").clear().type("12/10/2024");
      cy.findByLabelText("End date").clear().type("01/05/2025");
      cy.button("Add filter").click();
    });

    cy.wait("@dataset");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 487 rows").should("be.visible");
  });

  it("should work with relative date filter applied to a custom column (metabase#16273)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();

    H.enterCustomColumnDetails({
      formula: "case([Discount] > 0, [Created At], [Product → Created At])",
      name: "MiscDate",
    });
    H.popover().button("Done").click();

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("MiscDate").click();
      cy.findByText("Relative date range…").click();
      cy.findByText("Previous").click();
      cy.findByDisplayValue("days").click();
    });
    cy.findByRole("listbox").findByText("years").click();

    H.popover().within(() => {
      cy.findByText("Include this year").click();
      cy.button("Add filter").click();
    });

    H.visualize(({ body }) => {
      expect(body.error).to.not.exist;
    });

    H.queryBuilderMain().findByText("MiscDate").should("be.visible");
    cy.findByTestId("qb-filters-panel")
      .findByText("MiscDate is in the previous 30 years or this year")
      .should("be.visible");
  });

  it("should allow indenting using Tab", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({ formula: "1 + 2", blur: false });

    // Tab should insert indentation
    cy.realPress("Tab");
    H.CustomExpressionEditor.value().should("equal", "1 + 2  ");
  });

  it("should not format expression when pressing tab in the editor", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({ formula: "1+1" });

    cy.realPress("Tab");
    cy.realPress(["Shift", "Tab"]);

    // `1+1` (3 chars) is reformatted to `1 + 1` (5 chars)
    H.CustomExpressionEditor.value().should("equal", "1+1");
    H.CustomExpressionEditor.type("2");

    // Fix prevents display value from being `1 +2 1` due to cursor position
    // being wrong after formatting.
    // That's because the caret position after refocusing on textarea
    // would still be after the 3rd character
    H.CustomExpressionEditor.value().should("equal", "1+12");
  });

  it("should format expression when clicking the format button", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({ formula: "1+1" });

    // `1+1` (3 chars) is reformatted to `1 + 1` (5 chars)
    H.CustomExpressionEditor.format();
    H.CustomExpressionEditor.value().should("equal", "1 + 1");
    H.CustomExpressionEditor.type("2");

    // Fix needed will prevent display value from being `1 +2 1`.
    // That's because the caret position after refocusing on textarea
    // would still be after the 3rd character
    H.CustomExpressionEditor.value().should("equal", "1 + 12");
  });

  it("should format the expression when pressing the format keyboard shortcut", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({ formula: "1+1" });

    // `1+1` (3 chars) is reformatted to `1 + 1` (5 chars)
    H.CustomExpressionEditor.focus();
    H.CustomExpressionEditor.formatButton().should("be.visible");
    H.CustomExpressionEditor.get()
      .get(".cm-editor")
      .realPress(["Shift", H.metaKey, "f"]);
    H.CustomExpressionEditor.value().should("equal", "1 + 1");

    // Make sure the cursor is at the end of the expression
    H.CustomExpressionEditor.type("2");
    H.CustomExpressionEditor.value().should("equal", "1 + 12");
  });

  it("should not try formatting the expression when it's invalid using the keyboard shortcut", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({ formula: "1+" });

    H.CustomExpressionEditor.focus();
    cy.realPress(["Shift", H.metaKey, "f"]);
    H.CustomExpressionEditor.value().should("equal", "1+");

    // Make sure the cursor is at the end of the expression
    H.CustomExpressionEditor.type("2");
    H.CustomExpressionEditor.value().should("equal", "1+2");
  });

  it("should format long expressions on multiple lines", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({
      formula:
        "concat(coalesce([Product → Created At], [Created At]), 'foo', 'bar')",
      format: true,
    });

    H.CustomExpressionEditor.value().should(
      "equal",
      dedent`
        concat(
          coalesce([Product → Created At], [Created At]),
          "foo",
          "bar"
        )
      `.trim(),
    );
  });

  it("should not allow formatting when the expression contains an error", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "concat('foo', ",
    });
    H.CustomExpressionEditor.formatButton().should("not.exist");
  });

  it("should show the format button when the expression editor is empty", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();
    H.CustomExpressionEditor.formatButton().should("not.exist");
  });

  it("should not allow saving the expression when it is invalid", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "concat('foo', ",
      name: "A custom expression",
    });

    H.expressionEditorWidget().button("Done").should("be.disabled");
    H.CustomExpressionEditor.nameInput().focus().type("{enter}");
    H.expressionEditorWidget().should("be.visible");
  });

  it("should validate the expression when typing", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "concat('foo', ",
      name: "A custom expression",
    });
    H.expressionEditorWidget().button("Done").should("be.disabled");

    cy.log("Fix the expression");
    H.CustomExpressionEditor.type("{leftarrow}'bar')", { focus: true });
    H.expressionEditorWidget().button("Done").should("not.be.disabled");
  });

  it("should allow choosing a suggestion with Tab", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({ formula: "[Cre", blur: false });

    H.CustomExpressionEditor.completions().should("be.visible");

    // Suggestion popover shows up and this select the first one
    cy.realPress("Tab");

    // Focus remains on the expression editor
    cy.focused().should("have.attr", "role", "textbox");
  });

  it("should be possible to use the suggestion snippet arguments", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();

    H.CustomExpressionEditor.type("coalesc{tab}[Tax]{tab}[User ID]", {
      delay: 50,
    });
    H.CustomExpressionEditor.value().should(
      "equal",
      "coalesce([Tax], [User ID])",
    );
  });

  it("should be possible to use the suggestion templates", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.addCustomColumn();

    H.CustomExpressionEditor.type("coalesc{tab}", { delay: 50 });

    H.CustomExpressionEditor.type("[Tax]{tab}[User ID]", {
      focus: false,
      delay: 50,
    });
    H.CustomExpressionEditor.value().should(
      "equal",
      "coalesce([Tax], [User ID])",
    );
  });

  it("should allow to use `if` function", () => {
    H.openProductsTable({ mode: "notebook" });

    cy.log("custom columns");
    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({
      formula: 'if([ID] = 1, "First", [ID] = 2, "Second", "Other")',
      name: "If",
    });
    H.expressionEditorWidget().button("Done").click();
    H.getNotebookStep("expression").button("Filter").click();
    H.clauseStepPopover().within(() => {
      cy.findByText("If").click();
    });
    H.selectFilterOperator("Is");
    H.clauseStepPopover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("Other");
      cy.button("Add filter").click();
    });
    H.visualize();
    H.assertQueryBuilderRowCount(198);
    H.openNotebook();
    H.getNotebookStep("filter").findByText("If is Other").icon("close").click();
    H.getNotebookStep("expression").findByText("If").icon("close").click();

    cy.log("filters");
    H.getNotebookStep("data").button("Filter").click();
    H.clauseStepPopover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({
        formula: 'if([Category] = "Gadget", 1, [Category] = "Widget", 2) = 2',
      });
      cy.button("Done").click();
    });
    H.visualize();
    H.assertQueryBuilderRowCount(54);
    H.openNotebook();
    H.getNotebookStep("filter")
      .findByText("If is equal to 2")
      .icon("close")
      .click();

    cy.log("aggregations");
    H.getNotebookStep("data").button("Summarize").click();
    H.clauseStepPopover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({
        formula: 'sum(if([Category] = "Gadget", 1, 2))',
        name: "SumIf",
      });
      cy.button("Done").click();
    });
    H.visualize();
    cy.findByTestId("scalar-value").should("have.text", "347");
  });

  it("should allow to use `in` and `notIn` functions", () => {
    H.openProductsTable({ mode: "notebook" });

    cy.log("custom columns - in");
    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({
      formula: 'in("Gadget", [Vendor], [Category])',
      name: "InColumn",
    });
    H.expressionEditorWidget().button("Done").click();
    H.getNotebookStep("expression").button("Filter").click();
    H.clauseStepPopover().within(() => {
      cy.findByText("InColumn").click();
      cy.findByText("Add filter").click();
    });
    H.visualize();
    H.assertQueryBuilderRowCount(53);

    cy.log("custom columns - notIn");
    H.openNotebook();
    H.getNotebookStep("expression").findByText("InColumn").click();
    H.enterCustomColumnDetails({
      formula: 'notIn("Gadget", [Vendor], [Category])',
      name: "InColumn",
    });
    H.expressionEditorWidget().button("Update").click();
    H.visualize();
    H.assertQueryBuilderRowCount(147);

    cy.log("filters - in");
    H.openNotebook();
    H.getNotebookStep("expression")
      .findByText("InColumn")
      .icon("close")
      .click();
    H.getNotebookStep("data").button("Filter").click();
    H.clauseStepPopover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "in([ID], 1, 2, 3)" });
      cy.button("Done").click();
    });
    H.visualize();
    H.assertQueryBuilderRowCount(3);
    H.openNotebook();
    H.getNotebookStep("filter").findByText("ID is 3 selections").click();
    H.clauseStepPopover().within(() => {
      cy.findByText("3").next("button").click();
      cy.button("Update filter").click();
    });
    H.visualize();
    H.assertQueryBuilderRowCount(2);

    cy.log("filters - notIn");
    H.openNotebook();
    H.getNotebookStep("filter").findByText("ID is 2 selections").click();
    H.clauseStepPopover().within(() => {
      cy.findByLabelText("Back").click();
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "notIn([ID], 1, 2, 3)" });
      cy.button("Update").click();
    });
    H.visualize();
    H.assertQueryBuilderRowCount(197);

    cy.log("aggregations - in");
    H.openNotebook();
    H.getNotebookStep("filter")
      .findByText("ID is not 3 selections")
      .icon("close")
      .click();
    H.getNotebookStep("data").button("Summarize").click();
    H.clauseStepPopover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({
        formula: "countIf(in([ID], 1, 2))",
        name: "CountIfIn",
      });
      cy.button("Done").click();
    });
    H.visualize();
    cy.findByTestId("scalar-value").should("have.text", "2");

    cy.log("aggregations - notIn");
    H.openNotebook();
    H.getNotebookStep("summarize").findByText("CountIfIn").click();
    H.enterCustomColumnDetails({
      formula: "countIf(notIn([ID], 1, 2))",
      name: "CountIfIn",
    });
    H.expressionEditorWidget().button("Update").click();
    H.visualize();
    cy.findByTestId("scalar-value").should("have.text", "198");
  });

  it("should handle expression references", () => {
    H.openProductsTable({ mode: "notebook" });

    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({
      formula: "[Price]",
      name: "Foo",
    });
    H.expressionEditorWidget().button("Done").click();

    H.getNotebookStep("expression").icon("add").click();
    H.enterCustomColumnDetails({
      formula: "[Foo]",
      name: "Bar",
    });
    H.expressionEditorWidget().button("Done").click();

    H.getNotebookStep("expression").icon("add").click();
    H.enterCustomColumnDetails({
      formula: "[Bar]",
      name: "Quu",
    });
    H.expressionEditorWidget().button("Done").click();

    H.getNotebookStep("expression").findByText("Foo").click();
    H.CustomExpressionEditor.value().should("eq", "[Price]");
    H.expressionEditorWidget().button("Cancel").click();

    H.getNotebookStep("expression").findByText("Bar").click();
    H.CustomExpressionEditor.value().should("eq", "[Foo]");
    H.expressionEditorWidget().button("Cancel").click();

    H.getNotebookStep("expression").findByText("Quu").click();
    H.CustomExpressionEditor.value().should("eq", "[Bar]");
  });
});
