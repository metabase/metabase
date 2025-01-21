import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > question > custom column", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.restore();
    cy.signInAsNormalUser();
  });

  it("can see x-ray options when a custom column is present (#16680)", () => {
    cy.createQuestion(
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
    cy.cartesianChartCircle().eq(5).click();
    cy.popover()
      .findByText(/Automatic Insights/i)
      .click();
    cy.popover().findByText(/X-ray/i);
    cy.popover()
      .findByText(/Compare to the rest/i)
      .click();
  });

  it("can create a custom column (metabase#13241)", () => {
    cy.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    cy.enterCustomColumnDetails({ formula: "1 + 1", name: "Math" });
    cy.button("Done").click();

    cy.visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
    cy.findByTestId("query-visualization-root").contains("Math");
  });

  it("should not show default period in date column name (metabase#36631)", () => {
    const name = "Base question";
    cy.createQuestion({ name, query: { "source-table": ORDERS_ID } });

    cy.startNewQuestion();
    cy.entityPickerModal().within(() => {
      cy.entityPickerModalTab("Collections").click();
      cy.findByText(name).click();
    });
    cy.button("Custom column").click();
    cy.enterCustomColumnDetails({ formula: "[cre", blur: false });

    cy.findAllByTestId("expression-suggestions-list-item")
      .should("have.length", 1)
      .and("contain.text", "Created At")
      .and("not.contain.text", "Default period");
  });

  it("should not show binning for a numeric custom column", () => {
    cy.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    cy.enterCustomColumnDetails({
      formula: "[Product.Price] / 2",
      name: "Half Price",
    });
    cy.button("Done").click();

    cy.button("Summarize").click();
    cy.popover().findByText("Count of rows").click();

    cy.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();

    cy.popover()
      .findByRole("option", { name: "Half Price" })
      .within(() => {
        cy.findByLabelText("Binning strategy").should("not.exist");
        cy.findByLabelText("Temporal bucket").should("not.exist");
      })
      .click();

    cy.getNotebookStep("summarize")
      .findByText("Half Price")
      .should("be.visible");
  });

  it("should show temporal units for a date/time custom column", () => {
    cy.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    cy.enterCustomColumnDetails({
      formula: "[Product.Created At]",
      name: "Product Date",
    });
    cy.button("Done").click();

    cy.button("Summarize").click();
    cy.popover().findByText("Count of rows").click();

    cy.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    cy.popover()
      .findByRole("option", { name: "Product Date" })
      .within(() => {
        cy.findByLabelText("Binning strategy").should("not.exist");
        cy.findByLabelText("Temporal bucket").should("exist");
      })
      .click();

    cy.getNotebookStep("summarize")
      .findByText("Product Date: Month")
      .should("be.visible");
  });

  it("should not show binning options for a coordinate custom column", () => {
    cy.openPeopleTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    cy.enterCustomColumnDetails({
      formula: "[Latitude]",
      name: "UserLAT",
    });
    cy.button("Done").click();

    cy.button("Summarize").click();
    cy.popover().findByText("Count of rows").click();

    cy.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    cy.popover()
      .findByRole("option", { name: "UserLAT" })
      .within(() => {
        cy.findByLabelText("Binning strategy").should("not.exist");
        cy.findByLabelText("Temporal bucket").should("not.exist");
      })
      .click();

    cy.getNotebookStep("summarize").findByText("UserLAT").should("be.visible");
  });

  // flaky test (#19454)
  it.skip("should show info popovers when hovering over custom column dimensions in the summarize sidebar", () => {
    cy.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    cy.enterCustomColumnDetails({ formula: "1 + 1", name: "Math" });
    cy.button("Done").click();

    cy.visualize();

    cy.summarize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Group by").parent().findByText("Math").trigger("mouseenter");

    cy.popover().contains("Math");
    cy.popover().contains("No description");
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
      cy.openOrdersTable({ mode: "notebook" });
      cy.findByLabelText("Custom column").click();

      cy.enterCustomColumnDetails({ formula, name });
      cy.button("Done").click();

      cy.visualize();

      cy.findByTestId("query-visualization-root").contains(name);
    });
  });

  it("should create custom column with fields from aggregated data (metabase#12762)", () => {
    cy.openOrdersTable({ mode: "notebook" });

    cy.summarize({ mode: "notebook" });

    cy.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Subtotal").click();
    });

    // TODO: There isn't a single unique parent that can be used to scope this icon within
    // (a good candidate would be `.NotebookCell`)
    cy.icon("add")
      .last() // This is brittle.
      .click();

    cy.popover().within(() => {
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

    cy.enterCustomColumnDetails({
      formula: "[Sum of Subtotal] + [Sum of Total]",
      name: columnName,
    });
    cy.button("Done").click();

    cy.visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
    // This is a pre-save state of the question but the column name should appear
    // both in tabular and graph views (regardless of which one is currently selected)
    cy.findByTestId("query-visualization-root").contains(columnName);
  });

  it("should not return same results for columns with the same name (metabase#12649)", () => {
    cy.openOrdersTable({ mode: "notebook" });
    // join with Products
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();

    cy.entityPickerModal().within(() => {
      cy.entityPickerModalTab("Tables").click();
      cy.findByText("Products").click();
    });

    // add custom column
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    cy.enterCustomColumnDetails({ formula: "1 + 1", name: "x" });
    cy.button("Done").click();

    cy.visualize();

    cy.log(
      "**Fails in 0.35.0, 0.35.1, 0.35.2, 0.35.4 and the latest master (2026-10-21)**",
    );
    cy.log("Works in 0.35.3");
    // ID should be "1" but it is picking the product ID and is showing "14"
    cy.get(".test-TableInteractive-cellWrapper--firstColumn")
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
    cy.cartesianChartCircle().should("have.length.of.at.least", 8);
  });

  it("should create custom column after aggregation with 'cum-sum/count' (metabase#13634)", () => {
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
    cy.findAllByText("57,911");
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

  it("should drop custom column (based on a joined field) when a join is removed (metabase#14775)", () => {
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

    cy.visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    cy.get("[data-testid=cell-data]").should("contain", "37.65");
    cy.findAllByTestId("header-cell").should("not.contain", CE_NAME);
  });

  it("should handle using `case()` when referencing the same column names (metabase#14854)", () => {
    const CC_NAME = "CE with case";

    cy.visitQuestionAdhoc(
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
        expressions: { "MyCC [2027]": ["+", 1, 1] },
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });
    cy.summarize({ mode: "notebook" });
    cy.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("MyCC [2027]").click();
    });
    cy.findAllByTestId("notebook-cell-item")
      .contains("Sum of MyCC [2027]")
      .click();
    cy.popover().within(() => {
      cy.icon("chevronleft").click();
      cy.findByText("Custom Expression").click();
    });
    cy.get(".ace_line").contains("Sum([MyCC \\[2027\\]]");
  });

  it.skip("should work with `isNull` function (metabase#15922)", () => {
    cy.openOrdersTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    cy.enterCustomColumnDetails({
      formula: "isnull([Discount])",
      name: "No discount",
    });
    cy.button("Done").click();

    cy.visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("No discount");
  });

  it("should be able to add a date range filter to a custom column", () => {
    cy.visitQuestionAdhoc({
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

    cy.tableHeaderClick("CustomDate");

    cy.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Specific dates…").click();
      cy.findByLabelText("Start date").clear().type("12/10/2024");
      cy.findByLabelText("End date").clear().type("01/05/2025");
      cy.button("Add filter").click();
    });

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 487 rows").should("be.visible");
  });

  it("should work with relative date filter applied to a custom column (metabase#16273)", () => {
    cy.openOrdersTable({ mode: "notebook" });
    cy.addCustomColumn();

    cy.enterCustomColumnDetails({
      formula: "case([Discount] > 0, [Created At], [Product → Created At])",
      name: "MiscDate",
    });
    cy.popover().button("Done").click();

    cy.filter({ mode: "notebook" });
    cy.popover().within(() => {
      cy.findByText("MiscDate").click();
      cy.findByText("Relative dates…").click();
      cy.findByText("Previous").click();
      cy.findByDisplayValue("days").click();
    });
    cy.findByRole("listbox").findByText("years").click();

    cy.popover().within(() => {
      cy.findByText("Include this year").click();
      cy.button("Add filter").click();
    });

    cy.visualize(({ body }) => {
      expect(body.error).to.not.exist;
    });

    cy.queryBuilderMain().findByText("MiscDate").should("be.visible");
    cy.findByTestId("qb-filters-panel")
      .findByText("MiscDate is in the previous 30 years")
      .should("be.visible");
  });

  it("should allow switching focus with Tab", () => {
    cy.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    cy.enterCustomColumnDetails({ formula: "1 + 2" });

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
    cy.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    cy.enterCustomColumnDetails({ formula: "1+1" });

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
    cy.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    cy.enterCustomColumnDetails({ formula: "[C", blur: false });

    // Suggestion popover shows up and this select the first one ([Created At])
    cy.realPress("Tab");

    // Focus remains on the expression editor
    cy.focused().should("have.attr", "class").and("eq", "ace_text-input");

    // This really shouldn't be needed, but without interacting with the field, we can't tab away from it.
    // TODO: Fix
    cy.get(".ace_text-input").first().type(" ");

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

  // TODO: fixme!
  it.skip("should render custom expression helper near the custom expression field", () => {
    cy.openOrdersTable({ mode: "notebook" });
    cy.findByLabelText("Custom column").click();

    cy.popover().within(() => {
      cy.enterCustomColumnDetails({ formula: "floor" });

      cy.checkExpressionEditorHelperPopoverPosition();
    });
  });

  it("should allow to use `if` function", () => {
    cy.openProductsTable({ mode: "notebook" });

    cy.log("custom columns");
    cy.getNotebookStep("data").button("Custom column").click();
    cy.popover()
      .findByTestId("expression-editor")
      .within(() => {
        cy.enterCustomColumnDetails({
          formula: 'if([ID] = 1, "First", [ID] = 2, "Second", "Other")',
          name: "If",
        });
        cy.button("Done").click();
      });
    cy.getNotebookStep("expression").button("Filter").click();
    cy.popover().within(() => {
      cy.findByText("If").click();
      cy.findByPlaceholderText("Enter some text").type("Other");
      cy.button("Add filter").click();
    });
    cy.visualize();
    cy.assertQueryBuilderRowCount(198);
    cy.openNotebook();
    cy.getNotebookStep("filter")
      .findByText("If is Other")
      .icon("close")
      .click();
    cy.getNotebookStep("expression").findByText("If").icon("close").click();

    cy.log("filters");
    cy.getNotebookStep("data").button("Filter").click();
    cy.popover()
      .first()
      .within(() => {
        cy.findByText("Custom Expression").click();
        cy.enterCustomColumnDetails({
          formula: 'if([Category] = "Gadget", 1, [Category] = "Widget", 2) = 2',
        });
        cy.button("Done").click();
      });
    cy.visualize();
    cy.assertQueryBuilderRowCount(54);
    cy.openNotebook();
    cy.getNotebookStep("filter")
      .findByText("If is equal to 2")
      .icon("close")
      .click();

    cy.log("aggregations");
    cy.getNotebookStep("data").button("Summarize").click();
    cy.popover().within(() => {
      cy.findByText("Custom Expression").click();
      cy.enterCustomColumnDetails({
        formula: 'sum(if([Category] = "Gadget", 1, 2))',
        name: "SumIf",
      });
      cy.button("Done").click();
    });
    cy.visualize();
    cy.findByTestId("scalar-value").should("have.text", "347");
  });

  it("should allow to use `in` and `notIn` functions", () => {
    cy.openProductsTable({ mode: "notebook" });

    cy.log("custom columns - in");
    cy.getNotebookStep("data").button("Custom column").click();
    cy.popover()
      .findByTestId("expression-editor")
      .within(() => {
        cy.enterCustomColumnDetails({
          formula: 'in("Gadget", [Vendor], [Category])',
          name: "InColumn",
        });
        cy.button("Done").click();
      });
    cy.getNotebookStep("expression").button("Filter").click();
    cy.popover().within(() => {
      cy.findByText("InColumn").click();
      cy.findByText("Add filter").click();
    });
    cy.visualize();
    cy.assertQueryBuilderRowCount(53);

    cy.log("custom columns - notIn");
    cy.openNotebook();
    cy.getNotebookStep("expression").findByText("InColumn").click();
    cy.popover()
      .first()
      .within(() => {
        cy.enterCustomColumnDetails({
          formula: 'notIn("Gadget", [Vendor], [Category])',
          name: "InColumn",
        });
        cy.button("Update").click();
      });
    cy.visualize();
    cy.assertQueryBuilderRowCount(147);

    cy.log("filters - in");
    cy.openNotebook();
    cy.getNotebookStep("expression")
      .findByText("InColumn")
      .icon("close")
      .click();
    cy.getNotebookStep("data").button("Filter").click();
    cy.popover().within(() => {
      cy.findByText("Custom Expression").click();
      cy.enterCustomColumnDetails({ formula: "in([ID], 1, 2, 3)" });
      cy.button("Done").click();
    });
    cy.visualize();
    cy.assertQueryBuilderRowCount(3);
    cy.openNotebook();
    cy.getNotebookStep("filter").findByText("ID is 3 selections").click();
    cy.popover().within(() => {
      cy.findByText("3").next("button").click();
      cy.button("Update filter").click();
    });
    cy.visualize();
    cy.assertQueryBuilderRowCount(2);

    cy.log("filters - notIn");
    cy.openNotebook();
    cy.getNotebookStep("filter").findByText("ID is 2 selections").click();
    cy.popover().within(() => {
      cy.findByLabelText("Back").click();
      cy.findByText("Custom Expression").click();
      cy.enterCustomColumnDetails({ formula: "notIn([ID], 1, 2, 3)" });
      cy.button("Done").click();
    });
    cy.visualize();
    cy.assertQueryBuilderRowCount(197);

    cy.log("aggregations - in");
    cy.openNotebook();
    cy.getNotebookStep("filter")
      .findByText("ID is not 3 selections")
      .icon("close")
      .click();
    cy.getNotebookStep("data").button("Summarize").click();
    cy.popover().within(() => {
      cy.findByText("Custom Expression").click();
      cy.enterCustomColumnDetails({
        formula: "countIf(in([ID], 1, 2))",
        name: "CountIfIn",
      });
      cy.button("Done").click();
    });
    cy.visualize();
    cy.findByTestId("scalar-value").should("have.text", "2");

    cy.log("aggregations - notIn");
    cy.openNotebook();
    cy.getNotebookStep("summarize").findByText("CountIfIn").click();
    cy.popover().within(() => {
      cy.enterCustomColumnDetails({
        formula: "countIf(notIn([ID], 1, 2))",
        name: "CountIfIn",
      });
      cy.button("Update").click();
    });
    cy.visualize();
    cy.findByTestId("scalar-value").should("have.text", "198");
  });
});

describe("scenarios > question > custom column > data type", () => {
  function addCustomColumns(columns) {
    cy.wrap(columns).each((column, index) => {
      if (index) {
        cy.getNotebookStep("expression").icon("add").click();
      } else {
        cy.findByLabelText("Custom column").click();
      }

      cy.enterCustomColumnDetails(column);
      cy.button("Done").click({ force: true });
    });
  }

  function openCustomColumnInTable(table) {
    cy.openTable({ table, mode: "notebook" });
    cy.findByText("Custom column").click();
  }

  beforeEach(() => {
    cy.restore();
    cy.restore("postgres-12");

    cy.signInAsAdmin();
  });

  it("should understand string functions (metabase#13217)", () => {
    openCustomColumnInTable(PRODUCTS_ID);

    cy.enterCustomColumnDetails({
      formula: "concat([Category], [Title])",
      name: "CategoryTitle",
    });

    cy.button("Done").click();

    cy.filter({ mode: "notebook" });

    cy.popover().within(() => {
      cy.findByText("CategoryTitle").click();
      cy.findByPlaceholderText("Enter a number").should("not.exist");
      cy.findByPlaceholderText("Enter some text").should("be.visible");
    });
  });

  it("should understand date functions", () => {
    cy.startNewQuestion();
    cy.entityPickerModal().within(() => {
      cy.entityPickerModalTab("Tables").click();
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

    cy.visualize();
  });

  it("should relay the type of a date field", () => {
    openCustomColumnInTable(PEOPLE_ID);

    cy.enterCustomColumnDetails({ formula: "[Birth Date]", name: "DoB" });
    cy.button("Done").click();

    cy.filter({ mode: "notebook" });
    cy.popover().within(() => {
      cy.findByText("DoB").click();
      cy.findByPlaceholderText("Enter a number").should("not.exist");
      cy.findByText("Relative dates…").click();
      cy.findByText("Previous").click();
      cy.findByDisplayValue("days").should("be.visible");
    });
  });

  it("should handle CASE (metabase#13122)", () => {
    openCustomColumnInTable(ORDERS_ID);

    cy.enterCustomColumnDetails({
      formula: "case([Discount] > 0, [Created At], [Product → Created At])",
      name: "MiscDate",
    });
    cy.button("Done").click();

    cy.filter({ mode: "notebook" });
    cy.popover().within(() => {
      cy.findByText("MiscDate").click();
      cy.findByPlaceholderText("Enter a number").should("not.exist");

      cy.findByText("Relative dates…").click();
      cy.findByText("Previous").click();
      cy.findByDisplayValue("days").should("be.visible");
    });
  });

  it("should handle COALESCE", () => {
    openCustomColumnInTable(ORDERS_ID);

    cy.enterCustomColumnDetails({
      formula: "COALESCE([Product → Created At], [Created At])",
      name: "MiscDate",
    });
    cy.button("Done").click();

    cy.filter({ mode: "notebook" });
    cy.popover().within(() => {
      cy.findByText("MiscDate").click();
      cy.findByPlaceholderText("Enter a number").should("not.exist");
      cy.findByText("Relative dates…").click();
      cy.findByText("Previous").click();
      cy.findByDisplayValue("days").should("be.visible");
    });
  });
});

describe("scenarios > question > custom column > error feedback", () => {
  beforeEach(() => {
    cy.restore();
    cy.signInAsAdmin();

    cy.openProductsTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
  });

  it("should catch non-existent field reference", () => {
    cy.enterCustomColumnDetails({
      formula: "abcdef",
      name: "Non-existent",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/^Unknown Field: abcdef/i);
  });

  it("should fail on expression validation errors", () => {
    cy.enterCustomColumnDetails({
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
    cy.restore();
    cy.signInAsAdmin();

    // This is the default screen size but we need it explicitly set for this test because of the resize later on
    cy.viewport(1280, 800);

    cy.openOrdersTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();

    cy.enterCustomColumnDetails({
      formula: "1+1", // Formula was intentionally written without spaces (important for this repro)!
      name: "Math",
    });
    cy.button("Done").should("not.be.disabled");
  });

  /**
   * We abuse {force: true} arguments below because AceEditor cannot be found
   * on a second click and type commands (the first ones happen in the beforeEach block above )
   */
  it("should not accidentally delete Custom Column formula value and/or Custom Column name (metabase#15734)", () => {
    cy.get("@formula")
      .click({ force: true })
      .type("{movetoend}{leftarrow}{movetostart}{rightarrow}{rightarrow}", {
        force: true,
      });
    cy.findByDisplayValue("Math").focus();
    cy.button("Done").should("not.be.disabled");
  });

  /**
   * 1. Explanation for `cy.get("@formula").click();`
   *  - Without it, test runner is too fast and the test results in false positive.
   *  - This gives it enough time to update the DOM. The same result can be achieved with `cy.wait(1)`
   */
  it("should not erase Custom column formula and Custom column name when expression is incomplete (metabase#16126)", () => {
    cy.get("@formula")
      .focus()
      .click({ force: true })
      .type("{movetoend}{backspace}", { force: true })
      .blur();

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
    cy.restore();
    cy.signInAsAdmin();

    cy.openProductsTable({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
  });

  it("should appear while inside a function", () => {
    cy.enterCustomColumnDetails({ formula: "Lower(", blur: false });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("lower(text)");
  });

  it("should appear after a field reference", () => {
    cy.enterCustomColumnDetails({ formula: "Lower([Category]", blur: false });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("lower(text)");
  });

  it("should not appear while outside a function", () => {
    cy.enterCustomColumnDetails({ formula: "Lower([Category])", blur: false });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("lower(text)").should("not.exist");
  });

  it("should not appear when formula field is not in focus (metabase#15891)", () => {
    cy.enterCustomColumnDetails({
      formula: "rou{enter}1.5){leftArrow}",
      blur: false,
    });

    cy.findByTestId("expression-helper-popover").findByText(
      "round([Temperature])",
    );

    cy.log("Blur event should remove the expression helper popover");
    cy.get("@formula").blur();
    cy.findByTestId("expression-helper-popover").should("not.exist");

    cy.get("@formula").focus();
    cy.findByTestId("expression-helper-popover").findByText(
      "round([Temperature])",
    );

    cy.log(
      "Pressing `escape` key should also remove the expression helper popover",
    );
    cy.get("@formula").type("{esc}");
    cy.findByTestId("expression-helper-popover").should("not.exist");
  });

  it("should not disappear when clicked on (metabase#17548)", () => {
    cy.enterCustomColumnDetails({ formula: "rou{enter}", blur: false });

    // Shouldn't hide on click
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("round([Temperature])").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("round([Temperature])");
  });
});
