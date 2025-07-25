const { H } = cy;
import { dedent } from "ts-dedent";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE_ID, PEOPLE } =
  SAMPLE_DATABASE;

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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.findByTestId("query-visualization-root").contains("Math");
  });

  it("should not show default period in date column name (metabase#36631)", () => {
    const name = "Base question";
    H.createQuestion({ name, query: { "source-table": ORDERS_ID } });

    H.startNewQuestion();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Collections").click();
      cy.findByText(name).click();
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
  it.skip("should show info popovers when hovering over custom column dimensions in the summarize sidebar", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.enterCustomColumnDetails({ formula: "1 + 1", name: "Math" });
    cy.button("Done").click();

    H.visualize();

    H.summarize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Group by").parent().findByText("Math").trigger("mouseenter");

    H.popover().contains("Math");
    H.popover().contains("No description");
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
    // eslint-disable-next-line no-unsafe-element-filtering
    cy.icon("add")
      .last() // This is brittle.
      .click();

    H.popover().within(() => {
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

    H.enterCustomColumnDetails({
      formula: "[Sum of Subtotal] + [Sum of Total]",
      name: columnName,
    });
    cy.button("Done").click();

    H.visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
    // This is a pre-save state of the question but the column name should appear
    // both in tabular and graph views (regardless of which one is currently selected)
    cy.findByTestId("query-visualization-root").contains(columnName);
  });

  it("should not return same results for columns with the same name (metabase#12649)", () => {
    H.openOrdersTable({ mode: "notebook" });
    // join with Products
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();

    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });

    // add custom column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("13634");

    cy.log("Reported failing in v0.34.3, v0.35.4, v0.36.8.2, v0.37.0.2");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(CC_NAME);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(CC_NAME);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

  it.skip("should work with `isNull` function (metabase#15922)", () => {
    H.openOrdersTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    H.enterCustomColumnDetails({
      formula: "isnull([Discount])",
      name: "No discount",
    });
    cy.button("Done").click();

    H.visualize((response) => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No discount");
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
    const isMac = Cypress.platform === "darwin";
    const metaKey = isMac ? "Meta" : "Control";

    H.CustomExpressionEditor.formatButton().should("be.visible");
    H.CustomExpressionEditor.get()
      .get(".cm-editor")
      .realPress(["Shift", metaKey, "f"]);
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
    const isMac = Cypress.platform === "darwin";
    const metaKey = isMac ? "Meta" : "Control";

    cy.realPress(["Shift", metaKey, "f"]);
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

    // Wait for error check to render, it should not affect the state of the snippets
    cy.wait(1300);

    H.CustomExpressionEditor.type("[Tax]{tab}[User ID]", {
      focus: false,
      delay: 50,
    });
    H.CustomExpressionEditor.value().should(
      "equal",
      "coalesce([Tax], [User ID])",
    );
  });

  // TODO: fixme!
  it.skip("should render custom expression helper near the custom expression field", () => {
    H.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    H.popover().within(() => {
      H.enterCustomColumnDetails({ formula: "floor" });

      H.checkExpressionEditorHelperPopoverPosition();
    });
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

describe(
  "scenarios > question > custom column > data type",
  { tags: "@external" },
  () => {
    function addCustomColumns(columns) {
      cy.wrap(columns).each((column, index) => {
        if (index) {
          H.getNotebookStep("expression").icon("add").click();
        } else {
          cy.findByLabelText("Custom column").click();
        }

        H.enterCustomColumnDetails(column);
        cy.button("Done").click({ force: true });
      });
    }

    function openCustomColumnInTable(table) {
      H.openTable({ table, mode: "notebook" });
      cy.findByText("Custom column").click();
    }

    beforeEach(() => {
      H.restore();
      H.restore("postgres-12");

      cy.signInAsAdmin();
    });

    it("should understand string functions (metabase#13217)", () => {
      openCustomColumnInTable(PRODUCTS_ID);

      H.enterCustomColumnDetails({
        formula: "concat([Category], [Title])",
        name: "CategoryTitle",
      });

      cy.button("Done").click();

      H.filter({ mode: "notebook" });

      H.popover().within(() => {
        cy.findByText("CategoryTitle").click();
        cy.findByPlaceholderText("Enter a number").should("not.exist");
        cy.findByPlaceholderText("Enter some text").should("be.visible");
      });
    });

    it("should understand date functions", () => {
      H.startNewQuestion();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("QA Postgres12").click();
        cy.findByText("Orders").click();
      });

      addCustomColumns([
        { name: "Year", formula: "year([Created At])" },
        { name: "Quarter", formula: "quarter([Created At])" },
        { name: "Month", formula: "month([Created At])" },
        { name: "Week", formula: 'week([Created At], "iso")' },
        { name: "Day", formula: "day([Created At])" },
        { name: "Weekday", formula: "weekday([Created At])" },
        { name: "Hour", formula: "hour([Created At])" },
        { name: "Minute", formula: "minute([Created At])" },
        { name: "Second", formula: "second([Created At])" },
        {
          name: "Datetime Add",
          formula: 'datetimeAdd([Created At], 1, "month")',
        },
        {
          name: "Datetime Subtract",
          formula: 'datetimeSubtract([Created At], 1, "month")',
        },
        {
          name: "ConvertTimezone 3 args",
          formula: 'convertTimezone([Created At], "Asia/Ho_Chi_Minh", "UTC")',
        },
        {
          name: "ConvertTimezone 2 args",
          formula: 'convertTimezone([Created At], "Asia/Ho_Chi_Minh")',
        },
      ]);

      H.visualize();
    });

    it("should relay the type of a date field", () => {
      openCustomColumnInTable(PEOPLE_ID);

      H.enterCustomColumnDetails({ formula: "[Birth Date]", name: "DoB" });
      cy.button("Done").click();

      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("DoB").click();
        cy.findByPlaceholderText("Enter a number").should("not.exist");
        cy.findByText("Relative date range…").click();
        cy.findByText("Previous").click();
        cy.findByDisplayValue("days").should("be.visible");
      });
    });

    it("should handle CASE (metabase#13122)", () => {
      openCustomColumnInTable(ORDERS_ID);

      H.enterCustomColumnDetails({
        formula: "case([Discount] > 0, [Created At], [Product → Created At])",
        name: "MiscDate",
      });
      cy.button("Done").click();

      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("MiscDate").click();
        cy.findByPlaceholderText("Enter a number").should("not.exist");

        cy.findByText("Relative date range…").click();
        cy.findByText("Previous").click();
        cy.findByDisplayValue("days").should("be.visible");
      });
    });

    it("should handle COALESCE", () => {
      openCustomColumnInTable(ORDERS_ID);

      H.enterCustomColumnDetails({
        formula: "COALESCE([Product → Created At], [Created At])",
        name: "MiscDate",
      });
      cy.button("Done").click();

      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("MiscDate").click();
        cy.findByPlaceholderText("Enter a number").should("not.exist");
        cy.findByText("Relative date range…").click();
        cy.findByText("Previous").click();
        cy.findByDisplayValue("days").should("be.visible");
      });
    });
  },
);

describe("scenarios > question > custom column > error feedback", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.openProductsTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
  });

  it("should catch non-existent field reference", () => {
    H.enterCustomColumnDetails({
      formula: "abcdef",
      name: "Non-existent",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/^Unknown column: abcdef/i);
  });

  it("should fail on expression validation errors", () => {
    H.enterCustomColumnDetails({
      formula: "SUBSTRING('foo', 0, 1)",
      name: "BadSubstring",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/positive integer/i);
  });
});

// ExpressionEditorTextfield jsx component
describe("scenarios > question > custom column > expression editor", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    // This is the default screen size but we need it explicitly set for this test because of the resize later on
    cy.viewport(1280, 800);

    H.openOrdersTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();

    H.enterCustomColumnDetails({
      formula: "1+1", // Formula was intentionally written without spaces (important for this repro)!
      name: "Math",
    });
    cy.button("Done").should("not.be.disabled");
  });

  it("should not accidentally delete Custom Column formula value and/or Custom Column name (metabase#15734)", () => {
    H.CustomExpressionEditor.type(
      "{movetoend}{leftarrow}{movetostart}{rightarrow}{rightarrow}",
    );
    cy.findByDisplayValue("Math").focus();
    cy.button("Done").should("not.be.disabled");
  });

  it("should not erase Custom column formula and Custom column name when expression is incomplete (metabase#16126)", () => {
    H.CustomExpressionEditor.type("{movetoend}{backspace}").blur();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Expected expression");
    cy.button("Done").should("be.disabled");
  });

  it("should not erase Custom Column formula and Custom Column name on window resize (metabase#16127)", () => {
    cy.viewport(1260, 800);
    cy.findByDisplayValue("Math");
    cy.button("Done").should("not.be.disabled");
  });
});

describe("scenarios > question > custom column > help text", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.openProductsTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
  });

  it("should appear while inside a function", () => {
    H.enterCustomColumnDetails({ formula: "lower(", blur: false });
    H.CustomExpressionEditor.helpTextHeader()
      .should("be.visible")
      .should("contain", "lower(value)");
  });

  it("should appear after a field reference", () => {
    H.enterCustomColumnDetails({ formula: "lower([Category]", blur: false });
    H.CustomExpressionEditor.helpTextHeader()
      .should("be.visible")
      .should("contain", "lower(value)");
  });

  it("should not appear while outside a function", () => {
    H.enterCustomColumnDetails({ formula: "lower([Category])", blur: false });
    H.CustomExpressionEditor.helpTextHeader().should("not.exist");
  });

  it("should not appear when formula field is not in focus (metabase#15891)", () => {
    H.enterCustomColumnDetails({
      formula: "rou{enter}1.5{leftArrow}",
      blur: false,
    });

    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "round([Temperature])");

    cy.log("Blur event should remove the expression helper popover");
    H.CustomExpressionEditor.blur();
    H.CustomExpressionEditor.helpText().should("not.exist");

    H.CustomExpressionEditor.focus().type("{leftArrow}");
    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "round([Temperature])");

    cy.log(
      "Pressing `escape` key should also remove the expression helper popover",
    );
    H.CustomExpressionEditor.blur();
    H.CustomExpressionEditor.helpText().should("not.exist");
  });

  it("should not disappear when clicked on (metabase#17548)", () => {
    H.enterCustomColumnDetails({ formula: "round(", blur: false });

    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "round([Temperature])");

    // Shouldn't hide on click
    H.CustomExpressionEditor.helpText().click();

    H.CustomExpressionEditor.helpText()
      .should("be.visible")
      .should("contain", "round([Temperature])");
  });

  describe("scenarios > question > custom column > help text > visibility", () => {
    beforeEach(() => {
      H.enterCustomColumnDetails({ formula: "round(", blur: false });
    });

    it("should be possible to show and hide the help text when there are no suggestions", () => {
      assertHelpTextIsVisible();

      H.CustomExpressionEditor.helpTextHeader().click();
      assertNeitherAreVisible();

      H.CustomExpressionEditor.helpTextHeader().click();
      assertHelpTextIsVisible();
    });

    it("should show the help text again when the suggestions are closed", () => {
      H.CustomExpressionEditor.type("[Rat", { focus: false });

      cy.log("suggestions should be visible");
      assertSuggestionsAreVisible();

      cy.log("help text should remain visible when suggestions are picked");
      // helptext should re-open when suggestion is picked
      H.CustomExpressionEditor.selectCompletion("Rating");
      assertHelpTextIsVisible();
    });

    it("should be possible to close the help text", () => {
      cy.log("hide help text by clicking the header");
      H.CustomExpressionEditor.helpTextHeader().click();
      assertNeitherAreVisible();

      cy.log("type to see suggestions");
      H.CustomExpressionEditor.type("[Rat", { focus: false });
      assertSuggestionsAreVisible();

      cy.log("help text should remain hidden after selecting a suggestion");
      H.CustomExpressionEditor.selectCompletion("Rating");
      assertNeitherAreVisible();
    });

    it("should be possible to prefer showing the help text over the suggestions", () => {
      cy.log("type to see suggestions");
      H.CustomExpressionEditor.type("[Rat", { focus: false });
      assertSuggestionsAreVisible();

      cy.log("show help text by clicking the header");
      H.CustomExpressionEditor.helpTextHeader().click();
      assertHelpTextIsVisible();

      cy.log("help text should remain shown after finishing typing");
      H.CustomExpressionEditor.type("ing], ", { focus: false });
      assertHelpTextIsVisible();
    });

    it("should be possible to prefer showing the suggestion when typing", () => {
      cy.log("type to see suggestions");
      H.CustomExpressionEditor.type("[Rat", { focus: false });
      assertSuggestionsAreVisible();

      cy.log("show help text by clicking the header");
      H.CustomExpressionEditor.helpTextHeader().click();
      assertHelpTextIsVisible();

      cy.log("show suggestions again by clicking the header");
      H.CustomExpressionEditor.helpTextHeader().click();
      assertSuggestionsAreVisible();

      cy.log("help text should remain shown after finishing typing");
      H.CustomExpressionEditor.type("ing], ", { focus: false });
      assertNeitherAreVisible();
    });

    function assertSuggestionsAreVisible() {
      cy.log("suggestions should be visible");
      H.CustomExpressionEditor.helpText().should("not.exist");
      H.CustomExpressionEditor.completions()
        .findAllByRole("option")
        .should("be.visible");
    }
    function assertHelpTextIsVisible() {
      cy.log("help text should be visible");
      H.CustomExpressionEditor.helpText().should("be.visible");
      H.CustomExpressionEditor.completions()
        .findByRole("option")
        .should("not.exist");
    }
    function assertNeitherAreVisible() {
      H.CustomExpressionEditor.helpText().should("not.exist");
      H.CustomExpressionEditor.completions()
        .findByRole("option")
        .should("not.exist");
    }
  });
});

describe("scenarios > question > custom column > exiting the editor", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.openProductsTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
  });

  it("should be possible to close the custom expression editor by pressing Escape when it is empty", () => {
    cy.realPress("Escape");
    H.CustomExpressionEditor.get().should("not.exist");
  });

  it("should not be possible to close the custom expression editor by pressing Escape when it is not empty", () => {
    H.CustomExpressionEditor.type("count(");
    cy.realPress("Escape");
    H.CustomExpressionEditor.get().should("be.visible");
  });

  it("should be possible to exit the editor by clicking outside of it when there is no text", () => {
    H.getNotebookStep("data").click();
    H.modal().should("not.exist");
    H.expressionEditorWidget().should("not.exist");
  });

  it("should be possible to exit the editor by clicking outside of it when there is no text, by clicking an interactive element", () => {
    H.getNotebookStep("data").button("Pick columns").click();
    H.modal().should("not.exist");
    H.expressionEditorWidget().should("not.exist");
    H.popover().findByText("Select all").should("be.visible");
  });

  it("should not be possible to exit the editor by clicking outside of it when there is an unsaved expression", () => {
    H.enterCustomColumnDetails({ formula: "1+1", blur: false });
    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("Select all").should("not.exist");
    H.expressionEditorWidget().should("exist");

    H.modal().within(() => {
      cy.findByText("Keep editing your custom expression?").should(
        "be.visible",
      );
      cy.button("Discard changes").should("be.enabled");
      cy.button("Keep editing").click();
    });

    H.modal().should("not.exist");
    H.expressionEditorWidget().should("exist");
  });

  it("should be possible to discard changes when clicking outside of the editor", () => {
    H.enterCustomColumnDetails({ formula: "1+1", blur: false });
    H.getNotebookStep("data").button("Pick columns").click();
    H.expressionEditorWidget().should("exist");
    H.popover().findByText("Select all").should("not.exist");

    H.modal().within(() => {
      cy.findByText("Keep editing your custom expression?").should(
        "be.visible",
      );
      cy.button("Keep editing").should("be.enabled");
      cy.button("Discard changes").click();
    });

    H.modal().should("not.exist");
    H.expressionEditorWidget().should("not.exist");
  });

  it("should be possible to discard changes by clicking cancel button", () => {
    H.enterCustomColumnDetails({ formula: "1+1", name: "OK" });
    H.expressionEditorWidget().button("Cancel").click();
    H.modal().should("not.exist");
    H.expressionEditorWidget().should("not.exist");
    H.getNotebookStep("expression").findByText("OK").should("not.exist");
  });

  it("should be possible to close the popover when navigating away from the expression editor", () => {
    H.expressionEditorWidget().button("Cancel").click();
    cy.button("Summarize").click();
    H.popover().as("popover").findByText("Custom Expression").click();
    H.enterCustomColumnDetails({ formula: "1+1" });

    cy.log("Go back to summarize modal");
    H.popover().findByText("Custom Expression").click();

    cy.log("Close summarize modal by clicking outside");
    cy.button("View SQL").click();

    H.modal().should("not.exist");
    cy.get("popover").should("not.exist");
  });
});

describe("scenarios > question > custom column > distinctIf", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to use a distinctIf function", () => {
    H.openProductsTable({ mode: "notebook" });

    cy.log("add a new expression");
    H.getNotebookStep("data").button("Summarize").click();
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({
      formula: "DistinctIf([ID], [Category] = 'Gadget')",
      name: "Distinct",
    });
    H.popover().button("Done").click();
    H.visualize();
    cy.findByTestId("scalar-value").should("have.text", "53");

    cy.log("modify the expression");
    H.openNotebook();
    H.getNotebookStep("summarize").findByText("Distinct").click();
    H.CustomExpressionEditor.value().should(
      "eq",
      'DistinctIf([ID], [Category] = "Gadget")',
    );
    H.enterCustomColumnDetails({
      formula: "DistinctIf([ID], [Category] != 'Gadget')",
      name: "Distinct",
    });
    H.popover().button("Update").click();
    H.visualize();
    cy.findByTestId("scalar-value").should("have.text", "147");
  });
});

describe("scenarios > question > custom column > path", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  function assertTableData({ title, value }) {
    // eslint-disable-next-line no-unsafe-element-filtering
    H.tableInteractive()
      .findAllByTestId("header-cell")
      .last()
      .should("have.text", title);

    // eslint-disable-next-line no-unsafe-element-filtering
    H.tableInteractiveBody()
      .findAllByTestId("cell-data")
      .last()
      .should("have.text", value);
  }

  it("should allow to use a path function", () => {
    const CC_NAME = "URL_URL";
    const questionDetails = {
      name: "path from url",
      query: {
        "source-table": PEOPLE_ID,
        limit: 1,
        expressions: {
          [CC_NAME]: [
            "concat",
            "http://",
            ["domain", ["field", PEOPLE.EMAIL, null]],
            ".com/my/path",
          ],
        },
      },
      type: "model",
    };

    H.createQuestion(questionDetails, {
      wrapId: true,
      idAlias: "modelId",
    });

    cy.get("@modelId").then((modelId) => {
      H.setModelMetadata(modelId, (field) => {
        if (field.name === CC_NAME) {
          return { ...field, semantic_type: "type/URL" };
        }

        return field;
      });

      H.visitModel(modelId);
    });

    H.openNotebook();

    cy.log("add a new expression");
    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({
      formula: `Path([${CC_NAME}])`,
      name: "extracted path",
    });

    H.popover().button("Done").click();
    H.visualize();
    cy.findByTestId("table-scroll-container").scrollTo("right");

    const extractedValue = "/my/path";
    assertTableData({
      title: "extracted path",
      value: extractedValue,
    });
  });
});

describe("scenarios > question > custom column > function browser", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.openProductsTable({ mode: "notebook" });
    H.addCustomColumn();
  });

  it("should be possible to insert functions by clicking them in the function browser", () => {
    H.expressionEditorWidget().button("Function browser").click();

    H.CustomExpressionEditor.functionBrowser()
      .findByText("datetimeAdd")
      .click();

    H.CustomExpressionEditor.value().should("equal", "datetimeAdd()");

    H.CustomExpressionEditor.functionBrowser().findByText("day").click();
    H.CustomExpressionEditor.value().should("equal", "datetimeAdd(day())");

    H.CustomExpressionEditor.type('"foo"{rightarrow}, ', { focus: false });
    H.CustomExpressionEditor.value().should(
      "equal",
      'datetimeAdd(day("foo"), )',
    );

    H.CustomExpressionEditor.functionBrowser().findByText("day").click();
    H.CustomExpressionEditor.value().should(
      "equal",
      'datetimeAdd(day("foo"), day())',
    );
  });

  it("should be possible to replace text when inserting functions", () => {
    H.CustomExpressionEditor.type("foo bar baz");
    cy.realPress(["ArrowLeft"]);
    cy.realPress(["ArrowLeft"]);
    cy.realPress(["ArrowLeft"]);
    cy.realPress(["ArrowLeft"]);
    cy.realPress(["Shift", "ArrowLeft"]);
    cy.realPress(["Shift", "ArrowLeft"]);
    cy.realPress(["Shift", "ArrowLeft"]);

    H.expressionEditorWidget().button("Function browser").click();
    H.CustomExpressionEditor.functionBrowser().findByText("day").click();
    H.CustomExpressionEditor.value().should("equal", "foo day() baz");
  });

  it("should be possible to filter functions in the function browser", () => {
    H.expressionEditorWidget().button("Function browser").click();

    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search functions…").type("con");

      cy.findByText("datetimeAdd").should("not.exist");
      cy.findByText("concat").should("be.visible");
      cy.findByText("second").should("be.visible");
      //
      cy.findByPlaceholderText("Search functions…").clear();
      cy.findByText("datetimeAdd").should("exist");
    });
  });

  it("should not show functions that are not supported by the current database", () => {
    H.expressionEditorWidget().button("Function browser").click();

    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search functions…").type("convertTimezone");
      cy.findByText("convertTimezone").should("not.exist");
    });
  });

  it("should not show aggregations unless aggregating", () => {
    H.expressionEditorWidget().button("Function browser").click();
    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search functions…").type("Count");
      cy.findByText("Count").should("not.exist");
    });
    H.expressionEditorWidget().button("Cancel").click();

    H.summarize({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();

    H.expressionEditorWidget().button("Function browser").click();
    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search aggregations…").type("Count");
      cy.findByText("Count").should("be.visible");
    });
  });

  it("show a message when no functions match the filter", () => {
    H.expressionEditorWidget().button("Function browser").click();
    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search functions…").type("foobar");
      cy.findByText("Didn't find any results").should("be.visible");
    });
  });

  it("should insert parens even when the clause has no arguments", () => {
    H.expressionEditorWidget().button("Function browser").click();
    H.CustomExpressionEditor.functionBrowser().within(() => {
      cy.findByPlaceholderText("Search functions…").type("now");
      cy.findByText("now").click();
    });
    H.CustomExpressionEditor.value().should("equal", "now()");
  });
});

describe("scenarios > question > custom column > splitPart", () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();

    H.startNewQuestion();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("QA Postgres12").click();
      cy.findByText("People").click();
    });

    cy.findByLabelText("Custom column").click();
  });

  function assertTableData({ title, value }) {
    // eslint-disable-next-line no-unsafe-element-filtering
    H.tableInteractive()
      .findAllByTestId("header-cell")
      .last()
      .should("have.text", title);

    // eslint-disable-next-line no-unsafe-element-filtering
    H.tableInteractiveBody()
      .findAllByTestId("cell-data")
      .last()
      .should("have.text", value);
  }

  it("should be possible to split a custom column", () => {
    const CC_NAME = "Split Title";

    H.enterCustomColumnDetails({
      formula: "splitPart([Name], ' ', 1)",
      name: CC_NAME,
    });
    H.popover().button("Done").click();

    cy.findByLabelText("Row limit").click();
    cy.findByPlaceholderText("Enter a limit").type(1).blur();

    H.visualize();

    H.tableInteractiveScrollContainer().scrollTo("right");
    assertTableData({ title: CC_NAME, value: "Hudson" });
  });

  it("should show a message when index is below 1", () => {
    H.enterCustomColumnDetails({
      formula: "splitPart([Name], ' ', 0)",
    });

    H.popover().button("Done").should("be.disabled");
    H.popover().should("contain", "Expected positive integer but found 0");
  });
});

describe("exercise today() function", () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should show today's date", () => {
    H.startNewQuestion();
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab("Tables").click();
      cy.findByText("QA Postgres12").click();
      cy.findByText("Products").click();
    });

    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText("Select all").click();
    cy.realPress("Escape");

    H.visualize();
    H.assertQueryBuilderRowCount(200);
    H.openNotebook();

    H.getNotebookStep("data").button("Custom column").click();
    H.enterCustomColumnDetails({ formula: "today()", name: "TODAY" });
    H.popover().button("Done").click();

    const today = new Date();
    const dateString = today.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    H.visualize();
    cy.findAllByTestId("header-cell").eq(1).should("have.text", "TODAY");
    cy.findAllByTestId("cell-data").eq(3).should("have.text", dateString);
  });
});

describe("scenarios > question > custom column > aggregation", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.openOrdersTable({ mode: "notebook" });
  });

  it("should be possible to resolve aggregations from the question", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", ORDERS.TOTAL, null]],
              {
                name: "Custom Sum",
                "display-name": "Custom Sum",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();

    H.CustomExpressionEditor.type("[Custom");
    H.CustomExpressionEditor.completion("Custom Sum")
      .should("be.visible")
      .click();
    H.CustomExpressionEditor.value().should("eq", "[Custom Sum]");
    H.CustomExpressionEditor.type("+ 1");
    H.CustomExpressionEditor.format();

    H.CustomExpressionEditor.nameInput().type("Derived");
    H.popover().button("Done").click();

    H.visualize();
    H.assertTableData({
      columns: ["Custom Sum", "Derived"],
    });
  });

  it("should be possible to resolve aggregations from the question directly", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", ORDERS.TOTAL, null]],
              {
                name: "Custom Sum",
                "display-name": "Custom Sum",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();

    H.CustomExpressionEditor.type("[Custom");
    H.CustomExpressionEditor.completion("Custom Sum")
      .should("be.visible")
      .click();
    H.CustomExpressionEditor.value().should("eq", "[Custom Sum]");
    H.CustomExpressionEditor.format();

    H.CustomExpressionEditor.nameInput().type("Derived");
    H.popover().button("Done").click();

    H.visualize();
    H.assertTableData({
      columns: ["Custom Sum", "Derived"],
    });
  });

  it("should be possible to resolve aggregations from the previous stage", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", ORDERS.TOTAL, null]],
              {
                name: "Custom Sum",
                "display-name": "Custom Sum",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    cy.findAllByLabelText("Custom column").eq(1).click();
    H.CustomExpressionEditor.type("[Custom S");
    H.CustomExpressionEditor.completion("Custom Sum")
      .should("be.visible")
      .click();
    H.CustomExpressionEditor.value().should("eq", "[Custom Sum]");
    H.CustomExpressionEditor.format();

    H.CustomExpressionEditor.nameInput().type("Derived");
    H.popover().button("Done").click();

    H.visualize();
    H.assertTableData({
      columns: ["Custom Sum", "Derived"],
    });
  });

  it("should not be possible to create cycles in custom aggregations", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", ORDERS.TOTAL, null]],
              {
                name: "Custom Sum",
                "display-name": "Custom Sum",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );

    H.openNotebook();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();
    H.CustomExpressionEditor.type("[Custom Sum] + 1");
    H.CustomExpressionEditor.nameInput().type("Custom Sum 2");
    H.popover().button("Done").click();

    H.getNotebookStep("summarize").findByText("Custom Sum").click();
    H.CustomExpressionEditor.clear().type("[Custom Sum 2]");

    H.popover()
      .findByText("Cycle detected: Custom Sum → Custom Sum 2 → Custom Sum")
      .should("be.visible");
  });

  it("should be possible to create aggregations with the same name", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", ORDERS.TOTAL, null]],
              {
                name: "Foo",
                "display-name": "Foo",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();
    H.CustomExpressionEditor.type("Min([Total])");
    H.CustomExpressionEditor.nameInput().type("Foo");
    H.popover().button("Done").click();

    H.getNotebookStep("summarize").within(() => {
      cy.findAllByText("Foo").should("have.length", 2);
    });
  });

  it("should be possible to reorder aggregations with the same name", () => {
    H.createQuestion(
      {
        query: { "source-table": ORDERS_ID },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    H.summarize({ mode: "notebook" });

    H.popover().findByText("Custom Expression").scrollIntoView().click();
    H.CustomExpressionEditor.type("Count() + 1");
    H.CustomExpressionEditor.nameInput().type("Count");
    H.popover().button("Done").click();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();
    H.CustomExpressionEditor.type("[Count] + 1");
    H.CustomExpressionEditor.nameInput().type("Count");
    H.popover().button("Done").click();

    H.getNotebookStep("summarize").icon("add").click();
    H.popover().findByText("Custom Expression").scrollIntoView().click();
    H.CustomExpressionEditor.type("[Count] + 2");
    H.CustomExpressionEditor.nameInput().type("Final");
    H.popover().button("Done").click();

    cy.log("Both the secound Count and Final should reference the first Count");
    H.visualize();
    H.assertTableData({
      columns: ["Count", "Count", "Final"],
      firstRows: [["18,761", "18,762", "18,763"]],
    });

    H.openNotebook();

    cy.log("Move the second Count to be the first");
    H.moveDnDKitElement(
      H.getNotebookStep("summarize")
        .findAllByText("Count")
        .should("have.length", 2)
        .last(),
      { horizontal: -400 },
    );

    cy.log("The values should not have changed, but the order should have");
    H.visualize();
    H.assertTableData({
      columns: ["Count", "Count", "Final"],
      firstRows: [["18,762", "18,761", "18,763"]],
    });
  });

  describe("scenarios > question > custom column > aggregation > as question source", () => {
    beforeEach(() => {
      H.createQuestion({
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              [
                "min",
                [
                  "field",
                  ORDERS.SUBTOTAL,
                  {
                    "base-type": "type/Float",
                  },
                ],
              ],
              {
                name: "Foo",
                "display-name": "Foo",
              },
            ],
            [
              "aggregation-options",
              [
                "+",
                [
                  "aggregation",
                  0,
                  {
                    "base-type": "type/Float",
                  },
                ],
                [
                  "avg",
                  [
                    "field",
                    ORDERS.TAX,
                    {
                      "base-type": "type/Float",
                    },
                  ],
                ],
              ],
              {
                name: "Bar",
                "display-name": "Bar",
              },
            ],
          ],
        },
      }).then((res) => {
        H.visitQuestionAdhoc(
          {
            type: "question",
            dataset_query: {
              database: SAMPLE_DB_ID,
              query: {
                "source-table": `card__${res.body.id}`,
              },
            },
          },
          { mode: "notebook" },
        );
      });
    });

    it("should be possible to use a question with nested aggregations as the source of another question", () => {
      H.visualize();
      H.assertTableData({
        columns: ["Foo", "Bar"],
        firstRows: [["15.69", "19.55"]],
      });
    });

    it("should be possible to use nested aggregations in custom columns of a new question", () => {
      H.addCustomColumn();
      H.CustomExpressionEditor.type("[Foo] + [Bar]");
      H.CustomExpressionEditor.nameInput().type("Sum");
      H.popover().button("Done").click();

      H.visualize();

      H.assertTableData({
        columns: ["Foo", "Bar", "Sum"],
        firstRows: [["15.69", "19.55", "35.24"]],
      });
    });

    it("should be possible to use nested aggregations in filter clause of a new question", () => {
      H.filter({ mode: "notebook" });
      H.popover().within(() => {
        cy.findByText("Bar").click();
        cy.findByPlaceholderText("Min").type("5");
        cy.findByPlaceholderText("Max").type("20");
        cy.button("Add filter").click();
      });
      H.visualize();
      H.assertTableData({
        columns: ["Foo", "Bar"],
        firstRows: [["15.69", "19.55"]],
      });
    });

    it("should be possible to use nested aggregations in join clause of a new question", () => {
      H.join();
      H.joinTable("Products");
      H.popover().findByText("Foo").click();
      H.popover().findByText("Price").click();

      H.getNotebookStep("join").button("Pick columns").click();
      H.popover().within(() => {
        cy.findByText("Select all").click();
        cy.findByText("ID").click();
      });

      H.visualize();
      H.assertTableData({
        columns: ["Foo", "Bar", "Products - Foo → ID"],
        firstRows: [["15.69", "19.55", "61"]],
      });
    });

    it("should be possible to use nested aggregations in order by clause of a new question", () => {
      H.sort();
      H.popover().findByText("Bar").click();

      H.visualize();
      H.assertTableData({
        columns: ["Foo", "Bar"],
        firstRows: [["15.69", "19.55"]],
      });
    });

    it("should be possible to use nested aggregations in breakout of a new question", () => {
      H.summarize({ mode: "notebook" });
      H.getNotebookStep("summarize")
        .findByText("Pick a column to group by")
        .click();
      H.popover().findByText("Bar").click();

      H.visualize();
      cy.findByTestId("scalar-value").should("have.text", "19.55");
    });
  });

  describe("scenarios > question > custom column > aggregation > in a follow up stage", () => {
    beforeEach(() => {
      H.createQuestion(
        {
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "aggregation-options",
                [
                  "min",
                  [
                    "field",
                    ORDERS.SUBTOTAL,
                    {
                      "base-type": "type/Float",
                    },
                  ],
                ],
                {
                  name: "Foo",
                  "display-name": "Foo",
                },
              ],
              [
                "aggregation-options",
                [
                  "+",
                  [
                    "aggregation",
                    0,
                    {
                      "base-type": "type/Float",
                    },
                  ],
                  [
                    "avg",
                    [
                      "field",
                      ORDERS.TAX,
                      {
                        "base-type": "type/Float",
                      },
                    ],
                  ],
                ],
                {
                  name: "Bar",
                  "display-name": "Bar",
                },
              ],
            ],
          },
        },
        { visitQuestion: true },
      );
      H.openNotebook();
    });

    it("should be possible to use nested aggregations in custom columns of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.addCustomColumn();
      });

      H.CustomExpressionEditor.type("[Foo] + [Bar]");
      H.CustomExpressionEditor.nameInput().type("Sum");
      H.popover().button("Done").click();

      H.visualize();

      H.assertTableData({
        columns: ["Foo", "Bar", "Sum"],
        firstRows: [["15.69", "19.55", "35.24"]],
      });
    });

    it("should be possible to use nested aggregations in join clause of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.join();
      });

      H.joinTable("Products");
      H.popover().findByText("Foo").click();
      H.popover().findByText("Price").click();

      H.getNotebookStep("join", { stage: 1 }).button("Pick columns").click();
      H.popover().within(() => {
        cy.findByText("Select all").click();
        cy.findByText("ID").click();
      });

      H.visualize();
      H.assertTableData({
        columns: ["Foo", "Bar", "Products - Foo → ID"],
        firstRows: [["15.69", "19.55", "61"]],
      });
    });
  });

  describe("scenarios > question > custom column > aggregation with breakout > in a follow up stage", () => {
    beforeEach(() => {
      H.createQuestion(
        {
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "aggregation-options",
                [
                  "min",
                  [
                    "field",
                    ORDERS.SUBTOTAL,
                    {
                      "base-type": "type/Float",
                    },
                  ],
                ],
                {
                  name: "Foo",
                  "display-name": "Foo",
                },
              ],
              [
                "aggregation-options",
                [
                  "+",
                  [
                    "aggregation",
                    0,
                    {
                      "base-type": "type/Float",
                    },
                  ],
                  [
                    "avg",
                    [
                      "field",
                      ORDERS.TAX,
                      {
                        "base-type": "type/Float",
                      },
                    ],
                  ],
                ],
                {
                  name: "Bar",
                  "display-name": "Bar",
                },
              ],
            ],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
          },
        },
        { visitQuestion: true },
      );
      H.openNotebook();
    });

    it("should be possible to use nested aggregations in custom columns of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.addCustomColumn();
      });
      H.CustomExpressionEditor.type("[Foo] + [Bar]");
      H.CustomExpressionEditor.nameInput().type("Sum");
      H.popover().button("Done").click();

      H.visualize();

      H.assertTableData({
        columns: ["Created At: Month", "Foo", "Bar", "Sum"],
        firstRows: [["April 2022", "49.54", "52.76", "102.29"]],
      });
    });

    it("should be possible to use nested aggregations in filter clause of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.filter({ mode: "notebook" });
      });
      H.popover().within(() => {
        cy.findByText("Bar").click();
        cy.findByPlaceholderText("Min").type("5");
        cy.findByPlaceholderText("Max").type("20");
        cy.button("Add filter").click();
      });
      H.visualize();
      H.assertTableData({
        columns: ["Created At: Month", "Foo", "Bar"],
        firstRows: [["September 2022", "15.69", "18.57"]],
      });
    });

    it("should be possible to use nested aggregations in join clause of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.join();
      });
      H.joinTable("Products");

      H.popover().findByText("Foo").click();
      H.popover().findByText("Price").click();

      H.getNotebookStep("join", { stage: 1 }).button("Pick columns").click();
      H.popover().within(() => {
        cy.findByText("Select all").click();
        cy.findByText("ID").click();
      });

      H.visualize();
      H.assertTableData({
        columns: ["Created At: Month", "Foo", "Bar", "Products - Foo → ID"],
        firstRows: [["April 2022", "49.54", "52.76", "34"]],
      });
    });

    it("should be possible to use nested aggregations in order by clause of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.sort();
      });
      H.popover().findByText("Bar").click();

      H.visualize();
      H.assertTableData({
        columns: ["Created At: Month", "Foo", "Bar"],
        firstRows: [["April 2023", "15.69", "18.21"]],
      });
    });

    it("should be possible to use nested aggregations in breakout of a follow up stage", () => {
      H.getNotebookStep("summarize").within(() => {
        H.summarize({ mode: "notebook" });
      });

      H.popover().findByText("Count of rows").click();

      H.visualize();
      H.assertTableData({
        columns: ["Count"],
        firstRows: [["49"]],
      });
    });

    it("should be possible reference both aggregations with same name in follow up stage", () => {
      H.openOrdersTable({ mode: "notebook" });

      H.summarize({ mode: "notebook" });

      H.popover().findByText("Custom Expression").scrollIntoView().click();
      H.CustomExpressionEditor.type("Count() + 1");
      H.CustomExpressionEditor.nameInput().type("Count");
      H.popover().button("Done").click();

      H.getNotebookStep("summarize").icon("add").click();
      H.popover().findByText("Custom Expression").scrollIntoView().click();
      H.CustomExpressionEditor.type("[Count] + 1");
      H.CustomExpressionEditor.nameInput().type("Count");
      H.popover().button("Done").click();

      H.getNotebookStep("summarize")
        .findByText("Pick a column to group by")
        .click();
      H.popover().findByText("Created At").click();

      cy.log("Filter by the first Count");
      H.getNotebookStep("summarize").within(() => {
        H.filter({ mode: "notebook" });
      });
      H.popover().within(() => {
        cy.findAllByText("Count").should("have.length", 2);

        cy.findAllByText("Count").eq(0).click();

        // if this was referencing the second Count, it would filter out all rows
        cy.findByPlaceholderText("Max").type("2.5");
        cy.button("Add filter").click();
      });

      cy.log("Filter by the second Count");
      H.getNotebookStep("filter", { stage: 1 }).icon("add").click();
      H.popover().within(() => {
        cy.findAllByText("Count").should("have.length", 2);

        cy.findAllByText("Count").eq(1).click();

        // if this was referencing the first Count, it would filter out all rows
        cy.findByPlaceholderText("Min").type("2.5");
        cy.button("Add filter").click();
      });

      H.visualize();
      H.assertTableData({
        columns: ["Created At: Month", "Count", "Count"],
        firstRows: [["April 2022", "2", "3"]],
      });

      cy.log(
        "Swapping the aggregation clauses should not change the results, but the column order will be different",
      );
      H.openNotebook();
      H.moveDnDKitElement(
        H.getNotebookStep("summarize")
          .findAllByText("Count")
          .should("have.length", 2)
          .last(),
        { horizontal: -400 },
      );

      H.visualize();
      H.assertTableData({
        columns: ["Created At: Month", "Count", "Count"],
        firstRows: [["April 2022", "3", "2"]],
      });
    });
  });
});
