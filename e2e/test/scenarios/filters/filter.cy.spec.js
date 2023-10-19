import {
  enterCustomColumnDetails,
  restore,
  openOrdersTable,
  openProductsTable,
  openReviewsTable,
  openPeopleTable,
  popover,
  visitQuestionAdhoc,
  visualize,
  summarize,
  filter,
  filterField,
  filterFieldPopover,
  join,
  joinTable,
  setupBooleanQuery,
  checkExpressionEditorHelperPopoverPosition,
  getNotebookStep,
  queryBuilderMain,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID, SAMPLE_DB_SCHEMA_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > question > filter", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should filter a joined table by 'Is not' filter (metabase#13534)", () => {
    openOrdersTable({ mode: "notebook" });

    join();
    joinTable("Products");

    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
      cy.findByDisplayValue("Is").click();
    });
    cy.findByRole("listbox").findByText("Is not").click();
    popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });
    getNotebookStep("filter")
      .findByText("Products → Category is not Gizmo")
      .should("be.visible");

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    queryBuilderMain().within(() => {
      cy.contains("37.65").should("exist");
      cy.findByText("3621077291879").should("not.exist"); // one of the "Gizmo" EANs
    });
  });

  it("'Between Dates' filter should behave consistently (metabase#12872)", () => {
    cy.createQuestion(
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
    cy.get(".ScalarValue").contains("1");
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
    openOrdersTable();
    filter();

    filterFieldPopover("Product ID").contains("Aerodynamic Linen Coat").click();

    cy.findByTestId("apply-filters").click();

    cy.log("Reported failing on v0.36.4 and v0.36.5.1");
    cy.findByTestId("loading-spinner").should("not.exist");
    cy.findAllByText("148.23"); // one of the subtotals for this product
    cy.findAllByText("Fantastic Wool Shirt").should("not.exist");
  });

  it("should filter using Custom Expression from aggregated results (metabase#12839)", () => {
    const CE_NAME = "Simple Math";

    cy.createQuestion(
      {
        name: "12839",
        query: {
          filter: [">", ["field", CE_NAME, { "base-type": "type/Float" }], 0],
          "source-query": {
            aggregation: [
              [
                "aggregation-options",
                ["+", 1, 1],
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

    cy.createQuestion(
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
    cy.icon("filter").parent().contains("2").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(AGGREGATED_FILTER);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^Created At is after/i)
      .parent()
      .find(".Icon-close")
      .click();

    cy.log(
      "**Removing or changing filters shouldn't remove aggregated filter**",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(AGGREGATED_FILTER);
  });

  it("should display original custom expression filter with dates on subsequent click (metabase#12492)", () => {
    visitQuestionAdhoc({
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

    popover()
      .contains("[Created At] > [Product → Created At]")
      .should("be.visible");
  });

  it("should handle post-aggregation filter on questions with joined table (metabase#14811)", () => {
    cy.createQuestion(
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

    cy.get(".cellData").contains("Widget");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 1 row");
  });

  it("should reject Enter when the filter expression is invalid", () => {
    openReviewsTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    enterCustomColumnDetails({ formula: "[Rating] > 2E{enter}" }); // there should numbers after 'E'

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Missing exponent");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating is greater than 2").should("not.exist");
  });

  it("should offer case expression in the auto-complete suggestions", () => {
    openExpressionEditorFromFreshlyLoadedPage();

    enterCustomColumnDetails({ formula: "c" });
    popover().contains(/case/i);

    cy.get("@formula").type("a");

    // "case" is still there after typing a bit
    popover().contains(/case/i);
  });

  it("should enable highlighting suggestions with keyboard up and down arrows (metabase#16210)", () => {
    const transparent = "rgba(0, 0, 0, 0)";

    openExpressionEditorFromFreshlyLoadedPage();

    enterCustomColumnDetails({ formula: "c" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("case")
      .closest("li")
      .should("have.css", "background-color")
      .and("not.eq", transparent);

    cy.get("@formula").type("{downarrow}");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("case")
      .closest("li")
      .should("have.css", "background-color")
      .and("eq", transparent);

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("ceil")
      .closest("li")
      .should("have.css", "background-color")
      .and("not.eq", transparent);
  });

  it("should highlight the correct matching for suggestions", () => {
    openExpressionEditorFromFreshlyLoadedPage();

    enterCustomColumnDetails({ formula: "[" });

    popover().last().findByText("Body");

    cy.get("@formula").type("p");

    // only "P" (of Products etc) should be highlighted, and not "Pr"
    popover()
      .last()
      .within(() => {
        cy.findAllByText("P").should("have.length.above", 1);
        cy.findByText("Pr").should("not.exist");
      });
  });

  it("should provide accurate auto-complete custom-expression suggestions based on the aggregated column name (metabase#14776)", () => {
    cy.viewport(1400, 1000); // We need a bit taller window for this repro to see all custom filter options in the popover
    cy.createQuestion({
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
    enterCustomColumnDetails({ formula: "su" });
    popover().contains(/Sum of Total/i);
    cy.get("@formula").type("m");
    popover().contains(/Sum of Total/i);
  });

  it("should filter using IsNull() and IsEmpty()", () => {
    openReviewsTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    enterCustomColumnDetails({ formula: "NOT IsNull([Rating])" });
    cy.get("@formula").blur();

    cy.button("Done").should("not.be.disabled").click();

    cy.get(".QueryBuilder .Icon-add").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    enterCustomColumnDetails({ formula: "NOT IsEmpty([Reviewer])" });
    cy.get("@formula").blur();

    cy.button("Done").should("not.be.disabled").click();

    // check that filter is applied and rows displayed
    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 1,112 rows");
  });

  it("should convert 'is empty' on a text column to a custom expression using IsEmpty()", () => {
    openReviewsTable();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Reviewer").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Is").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Is empty").click();
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
    cy.get(".ace_text-input").clear().type("NOT IsEmpty([Reviewer])");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 1,112 rows");
  });

  it("should convert 'is empty' on a numeric column to a custom expression using IsNull()", () => {
    openReviewsTable();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Rating").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Equal to").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Is empty").click();
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
    cy.get(".ace_text-input")
      .clear()
      .type("NOT IsNull([Rating])", { delay: 50 });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 1,112 rows");
  });

  it("should convert negative filter to custom expression (metabase#14880)", () => {
    visitQuestionAdhoc({
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
    visitQuestionAdhoc({
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
    // Before we implement this feature, we can only assert that the input field for custom expression doesn't show at all
    cy.get(".ace_text-input");
  });

  it("should be able to convert time interval filter to custom expression (metabase#12457)", () => {
    openOrdersTable({ mode: "notebook" });

    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Relative dates…").click();
      cy.findByText("Past").click();
      cy.findByLabelText("Options").click();
    });
    popover()
      .last()
      .findByText(/^Include/)
      .click();
    popover().button("Add filter").click();

    getNotebookStep("filter")
      .findByText("Created At is in the previous 30 days")
      .click();

    popover().within(() => {
      cy.button("Back").click();
      cy.button("Back").click();
      cy.findByText("Custom Expression").click();
      cy.button("Done").click();
    });

    // Back to GUI and "Include today" should be still checked
    getNotebookStep("filter")
      .findByText("Created At is in the previous 30 days")
      .click();
    popover().findByLabelText("Options").click();
    popover()
      .last()
      .findByRole("menuitem", { name: /Include/ })
      .should("have.attr", "aria-selected", "true");
  });

  it("should be able to convert case-insensitive filter to custom expression (metabase#14959)", () => {
    visitQuestionAdhoc({
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
    cy.button("Done").click();
    cy.wait("@dataset").then(xhr => {
      expect(xhr.response.body.data.rows).to.have.lengthOf(1);
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("wilma-muller");
  });

  it("should reject a number literal", () => {
    openProductsTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    enterCustomColumnDetails({ formula: "3.14159" });
    cy.get("@formula").blur();

    cy.button("Done").should("be.disabled");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Expecting boolean but found 3.14159");
  });

  it("should reject a string literal", () => {
    openProductsTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    enterCustomColumnDetails({ formula: '"TheAnswer"' });
    cy.get("@formula").blur();

    cy.button("Done").should("be.disabled");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText('Expecting boolean but found "TheAnswer"');
  });

  it.skip("column filters should work for metrics (metabase#15333)", () => {
    visitQuestionAdhoc({
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

    cy.get(".cellData").contains("Count").click();
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
    openOrdersTable({ mode: "notebook" });

    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("Custom Expression").click();
      enterCustomColumnDetails({ formula: "[Total] < [Subtotal]" });
      cy.get("@formula").blur();
      cy.button("Done").click();
    });

    getNotebookStep("filter")
      .findByText("Total is less than Subtotal")
      .should("be.visible");
  });

  it("custom expression filter should allow the use of parentheses in combination with logical operators (metabase#15754)", () => {
    openOrdersTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    cy.get(".ace_text-input")
      .type("([ID] > 2 OR [Subtotal] = 100) and [Tax] < 4")
      .blur();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/^Expected closing parenthesis but found/).should(
      "not.exist",
    );
    cy.button("Done").should("not.be.disabled");
  });

  it("custom expression filter should refuse to work with numeric value before an operator (metabase#15893)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    openOrdersTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    cy.get(".ace_text-input").type("0 < [ID]").blur();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Expecting field but found 0");
  });

  it("should allow switching focus with Tab", () => {
    openOrdersTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    cy.get(".ace_text-input").type("[Tax] > 0");

    // Tab switches the focus to the "Done" button
    cy.realPress("Tab");
    cy.focused().should("have.attr", "class").and("contains", "Button");
  });

  it("should allow choosing a suggestion with Tab", () => {
    openOrdersTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    // Try to auto-complete Tax
    cy.get(".ace_text-input").type("Ta");

    // Suggestion popover shows up and this select the first one ([Created At])
    cy.realPress("Tab");

    // Focus remains on the expression editor
    cy.focused().should("have.attr", "class").and("eq", "ace_text-input");

    // Finish to complete a valid expression, i.e. [Tax] > 42
    cy.get(".ace_text-input").type("> 42");

    // Tab switches the focus to the "Done" button
    cy.realPress("Tab");
    cy.focused().should("have.attr", "class").and("contains", "Button");
  });

  it("should allow hiding the suggestion list with Escape", () => {
    openOrdersTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    // Try to auto-complete Tax
    cy.get(".ace_text-input").type("Ta");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Tax");

    // Esc closes the suggestion popover
    cy.realPress("{esc}");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Tax").should("not.exist");
  });

  it.skip("should work on twice summarized questions and preserve both summaries (metabase#15620)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-query": {
            "source-table": 1,
            aggregation: [["count"]],
            breakout: [["field", 7, { "temporal-unit": "month" }]],
          },
          aggregation: [
            ["avg", ["field", "count", { "base-type": "type/Integer" }]],
          ],
        },
        type: "query",
      },
    });

    cy.get(".ScalarValue").contains("5");
    filter();
    filterField("Category").within(() => {
      cy.findByText("Gizmo").click();
    });
    cy.findByTestId("apply-filters").click();

    cy.findByLabelText("notebook icon").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category is Gizmo").should("exist"); // filter
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At: Month").should("exist"); // summary 1
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Average of Count").should("exist"); // summary 2
  });

  it("user shouldn't need to scroll to add filter (metabase#14307)", () => {
    cy.viewport(1280, 720);
    openPeopleTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    popover().findByText("State").click({ force: true });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("AL").click();
    cy.button("Add filter").isVisibleInPopover();
  });

  it("should retain all data series after saving a question where custom expression formula is the first metric (metabase#15882)", () => {
    visitQuestionAdhoc({
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
    cy.get(".line").should("have.length", 3);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    cy.button("Save").click();
    cy.button("Not now").click();
    assertOnLegendLabels();
    cy.get(".line").should("have.length", 3);

    function assertOnLegendLabels() {
      cy.findAllByTestId("legend-item")
        .should("contain", "Discount %")
        .and("contain", "Count")
        .and("contain", "Average of Total");
    }
  });

  describe("currency filters", () => {
    beforeEach(() => {
      // set the currency on the Orders/Discount column to Euro
      cy.visit(
        `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
      );
      // this value isn't actually selected, it's just the default
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("US Dollar").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Euro").click();

      openOrdersTable();
    });

    it("should show correct currency symbols in currency single field filter", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Discount (€)").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Filter by this column").click();
      cy.findByTestId("input-prefix").should("contain", "€");
    });

    it("should show correct currency symbols in currency between field filter", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Discount (€)").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Filter by this column").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Equal to").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Between").click();

      cy.findAllByTestId("input-prefix").then(els => {
        expect(els).to.have.lengthOf(2);
        expect(els[0].innerText).to.equal("€");
        expect(els[1].innerText).to.equal("€");
      });
    });
  });

  describe("specific combination of filters can cause frontend reload or blank screen (metabase#16198)", () => {
    it("shouldn't display chosen category in a breadcrumb (metabase#16198-1)", () => {
      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            filter: [
              "and",
              ["=", ["field", PRODUCTS.CATEGORY, null], "Gizmo"],
              ["=", ["field", PRODUCTS.ID, null], 1],
            ],
          },
          type: "query",
        },
      });
    });

    it("adding an ID filter shouldn't cause page error and page reload (metabase#16198-2)", () => {
      openOrdersTable({ mode: "notebook" });
      filter({ mode: "notebook" });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Custom Expression").click();
      cy.get(".ace_text-input").type("[Total] < [Product → Price]").blur();
      cy.button("Done").click();
      // Filter currently says "Total is less than..." but it can change in https://github.com/metabase/metabase/pull/16174 to "Total < Price"
      // See: https://github.com/metabase/metabase/pull/16209#discussion_r638129099
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Total/);
      cy.icon("add").last().click();
      popover().findByText(/^ID$/i).click();
      cy.findByPlaceholderText("Enter an ID").type("1");
      cy.button("Add filter").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/^Total/);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Something went wrong").should("not.exist");
    });

    it("removing first filter in a sequence shouldn't result in an empty page (metabase#16198-3)", () => {
      openOrdersTable({ mode: "notebook" });

      filter({ mode: "notebook" });
      popover().within(() => {
        cy.findByText("Total").click();
        cy.findByPlaceholderText("Enter a number").type("123");
        cy.button("Add filter").click();
      });

      getNotebookStep("filter").icon("add").click();

      popover().within(() => {
        cy.findByText("Custom Expression").click();
        cy.get(".ace_text-input").type("[Total] < [Product → Price]").blur();
        cy.button("Done").click();
      });

      // cy.findByText(/^Total/);
      cy.icon("add").last().click();
      popover().findByText(/^ID$/i).click();
      cy.findByPlaceholderText("Enter an ID").type("1");
      cy.button("Add filter").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total is equal to 123")
        .parent()
        .find(".Icon-close")
        .click();

      visualize();
    });
  });

  ["True", "False"].forEach(condition => {
    const regexCondition = new RegExp(`${condition}`, "i");
    // We must use and return strings instead of boolean and numbers
    const integerAssociatedWithCondition = condition === "True" ? "0" : "1";

    describe(`should be able to filter on the boolean column ${condition.toUpperCase()} (metabase#16386)`, () => {
      beforeEach(setupBooleanQuery);

      it("from the column popover (metabase#16386-1)", () => {
        cy.findAllByTestId("header-cell")
          .contains("boolean")
          .should("be.visible")
          .click();

        popover().findByText("Filter by this column").click();

        popover().within(() => {
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
        cy.icon("notebook").click();

        filter({ mode: "notebook" });

        popover().within(() => {
          cy.findByText("boolean").click();
          addBooleanFilter();
        });

        visualize(() => {
          assertOnTheResult();
        });
      });

      it("from custom expressions", () => {
        cy.icon("notebook").click();

        filter({ mode: "notebook" });

        popover().contains("Custom Expression").click();
        popover().within(() => {
          enterCustomColumnDetails({ formula: `boolean = ${condition}` });
          cy.get("@formula").blur();

          cy.button("Done").click();
        });

        visualize(() => {
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
        cy.get(".cellData").should("contain", integerAssociatedWithCondition);
      }
    });
  });

  describe("should handle boolean arguments", () => {
    beforeEach(setupBooleanQuery);

    it("with case", () => {
      cy.icon("notebook").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Custom column").click();
      enterCustomColumnDetails({
        formula: "Case(boolean, 45, -10)",
        name: "Test",
      });

      cy.button("Done").click();

      filter({ mode: "notebook" });

      popover().contains("Custom Expression").click();
      popover().within(() => {
        enterCustomColumnDetails({ formula: `boolean = true` });
        cy.get("@formula").blur();

        cy.button("Done").click();
      });

      visualize(() => {
        cy.contains("45").should("exist");
        cy.contains("-10").should("not.exist");
      });
    });

    it("with CountIf", () => {
      cy.icon("notebook").click();
      summarize({ mode: "notebook" });
      popover().contains("Custom Expression").click();
      popover().within(() => {
        enterCustomColumnDetails({ formula: "CountIf(boolean)" });
        cy.findByPlaceholderText("Something nice and descriptive").type(
          "count if boolean is true",
        );
        cy.findByText("Done").click();
      });
      visualize(() => {
        cy.contains("2").should("exist");
      });
    });
  });

  it("should render custom expression helper near the custom expression field", async () => {
    openReviewsTable({ mode: "notebook" });
    filter({ mode: "notebook" });

    popover().within(() => {
      cy.findByText("Custom Expression").click();

      enterCustomColumnDetails({ formula: "floor" });

      checkExpressionEditorHelperPopoverPosition();
    });
  });
});

function openExpressionEditorFromFreshlyLoadedPage() {
  openReviewsTable({ mode: "notebook" });
  filter({ mode: "notebook" });
  cy.findByText("Custom Expression").click();
}
