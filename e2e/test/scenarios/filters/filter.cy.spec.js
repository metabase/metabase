const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > question > filter", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should filter a joined table by 'Is not' filter (metabase#13534)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.join();
    H.joinTable("Products");

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Products").click();
      cy.findByText("Category").click();
      cy.findByText("Is").click();
    });
    cy.findByRole("menu").findByText("Is not").click();
    H.popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });
    H.getNotebookStep("filter")
      .findByText("Products → Category is not Gizmo")
      .should("be.visible");

    H.visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    H.queryBuilderMain().within(() => {
      cy.contains("37.65").should("exist");
      cy.findByText("3621077291879").should("not.exist"); // one of the "Gizmo" EANs
    });
  });

  it("'Between Dates' filter should behave consistently (metabase#12872)", () => {
    H.createQuestion(
      {
        name: "12872",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          filter: [
            "and",
            [
              "between",
              ["field", PRODUCTS.CREATED_AT, null],
              "2025-04-15",
              "2025-04-15",
            ],
            [
              "between",
              ["field", PRODUCTS.CREATED_AT, { "join-alias": "Products" }],
              "2025-04-15",
              "2025-04-15",
            ],
          ],
          joins: [
            {
              alias: "Products",
              condition: [
                "=",
                ["field", PRODUCTS.ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Products" }],
              ],
              fields: "all",
              "source-table": PRODUCTS_ID,
            },
          ],
        },
        display: "scalar",
      },
      { visitQuestion: true },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("12872");
    cy.log("At the moment of unfixed issue, it's showing '0'");
    cy.findByTestId("scalar-value").contains("1");
  });

  it("should filter based on remapped values (metabase#13235)", () => {
    // set "Filtering on this field" = "A list of all values"
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    // "Display values" = "Use foreign key" as `Product.Title`
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    // Add filter as remapped Product ID (Product name)
    H.openOrdersTable();
    H.filter();

    H.filterFieldPopover("Product ID")
      .contains("Aerodynamic Linen Coat")
      .click();

    cy.findByTestId("apply-filters").click();

    cy.log("Reported failing on v0.36.4 and v0.36.5.1");
    cy.findByTestId("loading-indicator").should("not.exist");
    cy.findAllByText("148.23"); // one of the subtotals for this product
    cy.findAllByText("Fantastic Wool Shirt").should("not.exist");
  });

  it("should filter using Custom Expression from aggregated results (metabase#12839)", () => {
    const CE_NAME = "Simple Math";

    H.createQuestion(
      {
        name: "12839",
        query: {
          filter: [">", ["field", CE_NAME, { "base-type": "type/Float" }], 0],
          "source-query": {
            aggregation: [
              [
                "aggregation-options",
                ["+", ["count"], 1],
                { name: CE_NAME, "display-name": CE_NAME },
              ],
            ],
            breakout: [["field", PRODUCTS.CATEGORY, null]],
            "source-table": PRODUCTS_ID,
          },
        },
      },
      { visitQuestion: true },
    );

    cy.log("Reported failing on v0.35.4");
    cy.log(`Error message: **Column 'source.${CE_NAME}' not found;**`);
    cy.findAllByText("Gizmo");
  });

  it("should not drop aggregated filters (metabase#11957)", () => {
    const AGGREGATED_FILTER = "Count is less than or equal to 20";

    H.createQuestion(
      {
        name: "11957",
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            filter: [">", ["field", ORDERS.CREATED_AT, null], "2026-01-01"],
            aggregation: [["count"]],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }],
            ],
          },
          filter: [
            "<=",
            ["field", "count", { "base-type": "type/Integer" }],
            20,
          ],
        },
      },
      { visitQuestion: true },
    );

    // Test shows two filter collapsed - click on number 2 to expand and show filter names
    cy.findByTestId("filters-visibility-control")
      .should("have.text", "2")
      .click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(AGGREGATED_FILTER);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^Created At is after/i)
      .find(".Icon-close")
      .click();

    cy.log(
      "**Removing or changing filters shouldn't remove aggregated filter**",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(AGGREGATED_FILTER);
  });

  it("should display original custom expression filter with dates on subsequent click (metabase#12492)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: [
            ">",
            ["field", ORDERS.CREATED_AT, null],
            [
              "field",
              PRODUCTS.CREATED_AT,
              { "source-field": ORDERS.PRODUCT_ID },
            ],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "table",
    });

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is greater than Product → Created At")
      .click();

    H.popover()
      .contains("[Created At] > [Product → Created At]")
      .should("be.visible");
  });

  it("should handle post-aggregation filter on questions with joined table (metabase#14811)", () => {
    H.createQuestion(
      {
        name: "14811",
        query: {
          "source-query": {
            "source-table": ORDERS_ID,
            aggregation: [
              [
                "sum",
                [
                  "field",
                  PRODUCTS.PRICE,
                  { "source-field": ORDERS.PRODUCT_ID },
                ],
              ],
            ],
            breakout: [
              [
                "field",
                PRODUCTS.CATEGORY,
                { "source-field": ORDERS.PRODUCT_ID },
              ],
            ],
          },
          filter: [
            "=",
            ["field", "CATEGORY", { "base-type": "type/Text" }],
            "Widget",
          ],
        },
      },
      { visitQuestion: true },
    );

    cy.get("[data-testid=cell-data]").contains("Widget");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 1 row");
  });

  it("should reject Enter when the filter expression is invalid", () => {
    H.openReviewsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    H.enterCustomColumnDetails({ formula: "[Rating] > 2E{enter}" }); // there should numbers after 'E'

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Missing exponent");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating is greater than 2").should("not.exist");
  });

  it("should offer case expression in the auto-complete suggestions", () => {
    openExpressionEditorFromFreshlyLoadedPage();

    H.enterCustomColumnDetails({ formula: "c", blur: false });

    H.CustomExpressionEditor.completions().should("contain", "case");

    H.CustomExpressionEditor.type("a");

    // "case" is still there after typing a bit
    H.CustomExpressionEditor.completions().should("contain", "case");
  });

  it("should enable highlighting suggestions with keyboard up and down arrows (metabase#16210)", () => {
    openExpressionEditorFromFreshlyLoadedPage();

    H.enterCustomColumnDetails({ formula: "c", blur: false });

    H.CustomExpressionEditor.completion("case")
      .parent()
      .should("have.attr", "aria-selected", "true");

    // Avoid flakiness caused by CodeMirror not accepting the keypress
    // immediately
    cy.wait(200);
    cy.realPress("ArrowDown");

    H.CustomExpressionEditor.completion("ceil")
      .parent()
      .should("have.attr", "aria-selected", "true");

    H.CustomExpressionEditor.completion("case")
      .parent()
      .should("have.attr", "aria-selected", "false");
  });

  it("should highlight the correct matching for suggestions", () => {
    openExpressionEditorFromFreshlyLoadedPage();

    H.enterCustomColumnDetails({ formula: "[B", blur: false });

    H.CustomExpressionEditor.completion("Body").should("be.visible");

    H.CustomExpressionEditor.type("{backspace}p", { focus: false });

    H.CustomExpressionEditor.completion("Product ID").should("be.visible");
    H.CustomExpressionEditor.completion("Product ID")
      .findByText("P")
      .should("be.visible");
    H.CustomExpressionEditor.completion("Product ID")
      .findByText("roduct ID")
      .should("be.visible");
  });

  it("should provide accurate auto-complete custom-expression suggestions based on the aggregated column name (metabase#14776)", () => {
    cy.viewport(1400, 1000); // We need a bit taller window for this repro to see all custom filter options in the popover
    H.createQuestion({
      name: "14776",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    }).then(({ body: { id: QUESTION_ID } }) => {
      cy.visit(`/question/${QUESTION_ID}/notebook`);
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    H.enterCustomColumnDetails({ formula: "su", blur: false });

    H.CustomExpressionEditor.completion("Sum of Total").should("be.visible");

    H.CustomExpressionEditor.type("m", { focus: false });

    H.CustomExpressionEditor.completion("Sum of Total").should("be.visible");
  });

  it("should filter using IsNull() and IsEmpty()", () => {
    H.openReviewsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    H.enterCustomColumnDetails({ formula: "NOT IsNull([Rating])" });

    cy.button("Done").should("not.be.disabled").click();

    cy.findByTestId("query-builder-root").icon("add").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    H.enterCustomColumnDetails({
      formula: "NOT IsEmpty([Reviewer])",
    });

    cy.button("Done").should("not.be.disabled").click();

    // check that filter is applied and rows displayed
    H.visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 1,112 rows");
  });

  it("should convert 'is empty' on a text column to a custom expression using IsEmpty()", () => {
    H.openReviewsTable();
    H.tableHeaderClick("Reviewer");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    H.selectFilterOperator("Is empty");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add filter").click();

    // filter out everything
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 0 rows");

    // change the corresponding custom expression
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Reviewer is empty").click();
    cy.get(".Icon-chevronleft").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("isempty([Reviewer])");
    H.CustomExpressionEditor.clear().type("NOT IsEmpty([Reviewer])").blur();

    cy.button("Update").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 1,112 rows");
  });

  it("should convert 'is empty' on a numeric column to a custom expression using IsNull()", () => {
    H.openReviewsTable();
    H.tableHeaderClick("Rating");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    H.selectFilterOperator("Is empty");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add filter").click();

    // filter out everything
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 0 rows");

    // change the corresponding custom expression
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating is empty").click();
    cy.get(".Icon-chevronleft").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("isnull([Rating])");
    H.CustomExpressionEditor.clear()
      .type("NOT IsNull([Rating])", { delay: 50 })
      .blur();
    cy.button("Update").should("not.be.disabled").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 1,112 rows");
  });

  it("should convert negative filter to custom expression (metabase#14880)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          filter: [
            "does-not-contain",
            ["field", PRODUCTS.TITLE, null],
            "Wallet",
            { "case-sensitive": false },
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "table",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Title does not contain Wallet").click();
    cy.get(".Icon-chevronleft").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains('doesNotContain([Title], "Wallet", "case-insensitive")');
  });

  it("should convert negative filter to custom expression (metabase#14880)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          filter: [
            "does-not-contain",
            ["field", PRODUCTS.TITLE, null],
            "Wallet",
            { "case-sensitive": false },
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "table",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Title does not contain Wallet").click();
    cy.get(".Icon-chevronleft").click();
    H.popover().findByText("Custom Expression").click();

    // Before we implement this feature, we can only assert that the input field for custom expression doesn't show at all
    H.CustomExpressionEditor.focus().get().should("be.visible");
  });

  it("should be able to convert time interval filter to custom expression (metabase#12457)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Relative dates…").click();
      cy.findByText("Previous").click();
      cy.findByText(/^Include/).click();
      cy.button("Add filter").click();
    });

    H.getNotebookStep("filter")
      .findByText("Created At is in the previous 30 days")
      .click();

    H.clauseStepPopover().within(() => {
      cy.button("Back").click();
      cy.button("Back").click();
      cy.findByText("Custom Expression").click();
      cy.button("Update").click();
    });

    // Back to GUI and "Include today" should be still checked
    H.getNotebookStep("filter")
      .findByText("Created At is in the previous 30 days")
      .click();

    H.popover()
      .findByTestId("include-current-interval-option")
      .should("have.attr", "aria-checked", "true");
  });

  it("should be able to convert case-insensitive filter to custom expression (metabase#14959)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": REVIEWS_ID,
          filter: [
            "contains",
            ["field", REVIEWS.REVIEWER, null],
            "MULLER",
            { "case-sensitive": false },
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "table",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("wilma-muller");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Reviewer contains MULLER").click();
    cy.get(".Icon-chevronleft").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains('contains([Reviewer], "MULLER", "case-insensitive")');
    cy.button("Update").click();
    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.data.rows).to.have.lengthOf(1);
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("wilma-muller");
  });

  it("should reject a number literal", () => {
    H.openProductsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({ formula: "3.14159" });
    H.popover().within(() => {
      cy.button("Done").should("be.disabled");
      cy.findByText("Expecting boolean but found 3.14159");
    });
  });

  it("should reject a string literal", () => {
    H.openProductsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();
    H.enterCustomColumnDetails({ formula: '"TheAnswer"' });
    H.popover().within(() => {
      cy.button("Done").should("be.disabled");
      cy.findByText('Expecting boolean but found "TheAnswer"');
    });
  });

  it.skip("column filters should work for metrics (metabase#15333)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field-id", PRODUCTS.CATEGORY]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "table",
    });

    cy.get("[data-testid=cell-data]").contains("Count").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    cy.findByPlaceholderText("Enter a number").type("42");
    cy.button("Update filter").should("not.be.disabled").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Doohickey");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Gizmo").should("not.exist");
  });

  it("custom expression filter should reference fields by their name, not by their id (metabase#15748)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "[Total] < [Subtotal]" });
      cy.button("Done").click();
    });

    H.getNotebookStep("filter")
      .findByText("Total is less than Subtotal")
      .should("be.visible");
  });

  it("custom expression filter should allow the use of parentheses in combination with logical operators (metabase#15754)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.filter({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();

    H.CustomExpressionEditor.focus()
      .type("([ID] > 2 OR [Subtotal] = 100) and [Tax] < 4")
      .blur();

    H.expressionEditorWidget()
      .findByText(/^Expected closing parenthesis but found/)
      .should("not.exist");

    H.expressionEditorWidget().button("Done").should("not.be.disabled");
  });

  it("custom expression filter should refuse to work with numeric value before an operator (metabase#15893)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.openOrdersTable({ mode: "notebook" });

    H.filter({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();

    H.CustomExpressionEditor.focus().type("0 < [ID]").blur();

    H.expressionEditorWidget()
      .findByText("Expecting field but found 0")
      .should("be.visible");

    H.expressionEditorWidget().button("Done").should("be.disabled");
  });

  it("should not allow switching focus with Tab", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.filter({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();

    H.CustomExpressionEditor.focus().type("[Tax] > 0");

    // Tab switches the focus to the "Cancel" button
    cy.realPress("Tab");
    cy.focused().should("have.attr", "role", "textbox");

    H.CustomExpressionEditor.value().should("equal", "[Tax] > 0  ");
  });

  it("should allow choosing a suggestion with Tab", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.filter({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();

    // Try to auto-complete Tax
    H.CustomExpressionEditor.focus().type("Ta");

    // Suggestion popover shows up and this select the first one ([Tax])
    H.CustomExpressionEditor.acceptCompletion("tab");

    // Focus remains on the expression editor
    cy.focused().should("have.attr", "role", "textbox");

    // Finish to complete a valid expression, i.e. [Tax] > 42
    H.CustomExpressionEditor.type("> 42");

    // Tab switches the focus to the "Cancel" button
    cy.realPress("Tab");

    cy.focused().should("have.attr", "role", "textbox");
    H.CustomExpressionEditor.value().should("equal", "[Tax]> 42  ");
  });

  it("should allow hiding the suggestion list with Escape", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    // Try to auto-complete Tax
    H.CustomExpressionEditor.focus().type("Disc");

    H.CustomExpressionEditor.completions().should("be.visible");

    // Esc closes the suggestion popover
    cy.realPress("Escape");

    H.CustomExpressionEditor.completions().should("be.visible");
  });

  it("should work on twice summarized questions and preserve both summaries (metabase#15620)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-query": {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          aggregation: [
            ["avg", ["field", "count", { "base-type": "type/Integer" }]],
          ],
        },
      },
    });

    cy.findByTestId("scalar-value").contains("5.41");
    H.filter();

    H.filterField("Category").findByText("Gizmo").click();

    cy.findByTestId("apply-filters").click();
    H.openNotebook();

    H.verifyNotebookQuery("Products", [
      {
        filters: ["Category is Gizmo"],
        aggregations: ["Count"],
        breakouts: ["Created At: Month"],
      },
      {
        aggregations: ["Average of Count"],
      },
    ]);
  });

  it("user shouldn't need to scroll to add filter (metabase#14307)", () => {
    cy.viewport(1280, 720);
    H.openPeopleTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    H.popover().findByText("State").click({ force: true });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("AL").click();
    cy.button("Add filter").isVisibleInPopover();
  });

  it("should retain all data series after saving a question where custom expression formula is the first metric (metabase#15882)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              [
                "/",
                ["sum", ["field", ORDERS.DISCOUNT, null]],
                ["sum", ["field", ORDERS.SUBTOTAL, null]],
              ],
              { "display-name": "Discount %" },
            ],
            ["count"],
            ["avg", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        type: "query",
      },
      display: "line",
    });

    assertOnLegendLabels();
    H.cartesianChartCircleWithColors(["#88BF4D", "#509EE3", "#A989C5"]);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal")
      .findByLabelText(/Where do you want to save this/)
      .click();
    H.pickEntity({
      tab: "Browse",
      path: ["Our analytics"],
    });
    H.entityPickerModal().findByText("Select this collection").click();
    cy.findByTestId("save-question-modal").button("Save").click();

    assertOnLegendLabels();

    H.cartesianChartCircleWithColors(["#88BF4D", "#509EE3", "#A989C5"]);

    function assertOnLegendLabels() {
      cy.findAllByTestId("legend-item")
        .should("contain", "Discount %")
        .and("contain", "Count")
        .and("contain", "Average of Total");
    }
  });

  describe("specific combination of filters can cause frontend reload or blank screen (metabase#16198)", () => {
    it("shouldn't display chosen category in a breadcrumb (metabase#16198-1)", () => {
      const chosenCategory = "Gizmo";

      H.visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            filter: [
              "and",
              ["=", ["field", PRODUCTS.CATEGORY, null], chosenCategory],
              ["=", ["field", PRODUCTS.ID, null], 1],
            ],
          },
          type: "query",
        },
      });

      cy.findByTestId("head-crumbs-container").should(
        "not.contain",
        chosenCategory,
      );
    });

    it("adding an ID filter shouldn't cause page error and page reload (metabase#16198-2)", () => {
      H.openOrdersTable({ mode: "notebook" });
      H.filter({ mode: "notebook" });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Custom Expression").click();
      H.CustomExpressionEditor.type("[Total] < [Product → Price]").blur();
      H.CustomExpressionEditor.format();
      cy.button("Done").click();
      // Filter currently says "Total is less than..." but it can change in https://github.com/metabase/metabase/pull/16174 to "Total < Price"
      // See: https://github.com/metabase/metabase/pull/16209#discussion_r638129099
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Total/);
      // eslint-disable-next-line no-unsafe-element-filtering
      cy.icon("add").last().click();
      H.popover().findByText(/^ID$/i).click();
      cy.findByPlaceholderText("Enter an ID").type("1");
      cy.button("Add filter").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Total/);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Something went wrong").should("not.exist");
    });

    it("removing first filter in a sequence shouldn't result in an empty page (metabase#16198-3)", () => {
      H.openOrdersTable({ mode: "notebook" });

      H.filter({ mode: "notebook" });
      H.clauseStepPopover().findByText("Total").click();
      H.selectFilterOperator("Equal to");
      H.clauseStepPopover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("123");
        cy.button("Add filter").click();
      });

      H.getNotebookStep("filter").icon("add").click();

      H.clauseStepPopover().within(() => {
        cy.findByText("Custom Expression").click();
        H.CustomExpressionEditor.type("[Total] < [Product → Price]", {
          allowFastSet: true,
        }).blur();
        cy.button("Done").click();
      });

      // cy.findByText(/^Total/);
      // eslint-disable-next-line no-unsafe-element-filtering
      cy.icon("add").last().click();
      H.clauseStepPopover().findByText(/^ID$/i).click();
      cy.findByPlaceholderText("Enter an ID").type("1");
      cy.button("Add filter").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total is equal to 123")
        .parent()
        .find(".Icon-close")
        .click();

      H.visualize();
    });
  });

  ["True", "False"].forEach(condition => {
    const regexCondition = new RegExp(`${condition}`, "i");
    // We must use and return strings instead of boolean and numbers
    const integerAssociatedWithCondition = condition === "True" ? "0" : "1";

    describe(`should be able to filter on the boolean column ${condition.toUpperCase()} (metabase#16386)`, () => {
      beforeEach(H.setupBooleanQuery);

      it("from the column popover (metabase#16386-1)", () => {
        H.tableHeaderClick("boolean");

        H.popover().findByText("Filter by this column").click();

        H.popover().within(() => {
          // Not sure exactly what this popover will look like when this issue is fixed.
          // In one of the previous versions it said "Update filter" instead of "Add filter".
          // If that's the case after the fix, this part of the test might need to be updated accordingly.
          cy.findByLabelText(regexCondition)
            .check({ force: true }) // the radio input is hidden
            .should("be.checked");
          cy.button("Add filter").click();
          cy.wait("@dataset");
        });

        assertOnTheResult();
      });

      it("from the custom question (metabase#16386-3)", () => {
        H.openNotebook();

        H.filter({ mode: "notebook" });

        H.popover().within(() => {
          cy.findByText("boolean").click();
          addBooleanFilter();
        });

        H.visualize(() => {
          assertOnTheResult();
        });
      });

      it("from custom expressions", () => {
        H.openNotebook();

        H.filter({ mode: "notebook" });

        H.popover().contains("Custom Expression").click();

        H.enterCustomColumnDetails({ formula: `boolean = ${condition}` });
        H.expressionEditorWidget().button("Done").click();

        H.visualize(() => {
          assertOnTheResult();
        });
      });

      function addBooleanFilter() {
        // This is really inconvenient way to ensure that the element is selected, but it's the only one currently
        cy.findByLabelText(regexCondition)
          .check({ force: true })
          .should("be.checked");
        cy.button("Add filter").click();
      }

      function assertOnTheResult() {
        // Filter name
        cy.findByTextEnsureVisible(`boolean is ${condition.toLowerCase()}`);
        cy.get("[data-testid=cell-data]").should(
          "contain",
          integerAssociatedWithCondition,
        );
      }
    });
  });

  describe("should handle boolean arguments", () => {
    beforeEach(H.setupBooleanQuery);

    it("with case", () => {
      H.openNotebook();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Custom column").click();
      H.enterCustomColumnDetails({
        formula: "Case(boolean, 45, -10)",
        name: "Test",
      });

      cy.button("Done").click();

      H.filter({ mode: "notebook" });

      H.popover().contains("Custom Expression").click();

      H.enterCustomColumnDetails({ formula: "boolean = true" });
      H.expressionEditorWidget().button("Done").click();

      H.visualize(() => {
        cy.contains("45").should("exist");
        cy.contains("-10").should("not.exist");
      });
    });

    it("with CountIf", () => {
      H.openNotebook();
      H.summarize({ mode: "notebook" });
      H.popover().contains("Custom Expression").click();
      H.enterCustomColumnDetails({
        formula: "CountIf(boolean)",
        name: "count if boolean is true",
      });
      H.expressionEditorWidget().button("Done").click();
      cy.findByTestId("aggregate-step")
        .contains("count if boolean is true")
        .should("exist");
      H.visualize(() => {
        cy.contains("2").should("exist");
      });
    });
  });

  // TODO: fixme!
  it.skip("should render custom expression helper near the custom expression field", () => {
    H.openReviewsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });

    H.expressionEditorWidget().within(() => {
      cy.findByText("Custom Expression").click();

      H.enterCustomColumnDetails({ formula: "floor" });

      H.checkExpressionEditorHelperPopoverPosition();
    });
  });
});

function openExpressionEditorFromFreshlyLoadedPage() {
  H.openReviewsTable({ mode: "notebook" });
  H.filter({ mode: "notebook" });
  cy.findByText("Custom Expression").click();
}
