import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PEOPLE,
  PEOPLE_ID,
  REVIEWS,
  REVIEWS_ID,
} = SAMPLE_DATABASE;

describe("scenarios > filters", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should filter a joined, summarized question before and after the aggregation (metabase#13534, metabase#11957, metabase#24994)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              alias: "Products",
              "source-table": PRODUCTS_ID,
              condition: [
                "=",
                ["field", ORDERS.PRODUCT_ID, null],
                ["field", PRODUCTS.ID, { "join-alias": "Products" }],
              ],
            },
          ],
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
          ],
        },
      },
      display: "table",
    });
    H.assertQueryBuilderRowCount(4);

    cy.log("filter the joined column before the aggregation");
    H.filter();
    H.popover().within(() => {
      cy.findByText("Products").click();
      cy.findByText("Category").click();
      cy.findByText("Is").click();
    });
    cy.findByRole("menu").findByText("Is not").click();
    H.popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Apply filter").click();
    });
    H.queryBuilderFiltersPanel()
      .findByText("Products → Category is not Gizmo")
      .should("be.visible");
    H.assertQueryBuilderRowCount(3);
    H.tableInteractiveBody().within(() => {
      cy.findByText("3,976").should("be.visible"); // Doohickey
      cy.findByText("4,939").should("be.visible"); // Gadget
      cy.findByText("5,061").should("be.visible"); // Widget
      cy.findByText("Gizmo").should("not.exist");
    });

    cy.log("filter the aggregation, in a new stage");
    H.filter();
    H.popover().within(() => {
      cy.findByText("Summaries").click();
      cy.findByText("Count").click();
    });
    H.selectFilterOperator("Greater than");
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("4000");
      cy.button("Apply filter").click();
    });
    H.queryBuilderFiltersPanel()
      .findByText(/^Count is greater than 4,?000$/)
      .should("be.visible");
    H.assertQueryBuilderRowCount(2);
    H.tableInteractiveBody().findByText("Doohickey").should("not.exist");

    cy.log(
      "edit the first-stage filter of a question with an aggregation filter",
    );
    H.queryBuilderFiltersPanel()
      .findByText("Products → Category is not Gizmo")
      .click();
    H.popover().within(() => {
      cy.findByRole("checkbox", { name: "Gizmo" }).should("be.checked");
      cy.findByText("Widget").click();
      cy.button("Update filter").click();
    });
    H.queryBuilderFiltersPanel()
      .findByText("Products → Category is not 2 selections")
      .should("be.visible");
    H.assertQueryBuilderRowCount(1);
    H.tableInteractiveBody().findByText("Gadget").should("be.visible");

    cy.log("removing the first-stage filter keeps the aggregation filter");
    H.queryBuilderFiltersPanel()
      .findByText("Products → Category is not 2 selections")
      .icon("close")
      .click();
    H.queryBuilderFiltersPanel().within(() => {
      cy.findByText(/^Count is greater than 4,?000$/).should("be.visible");
      cy.findByText("Products → Category is not 2 selections").should(
        "not.exist",
      );
    });
    H.assertQueryBuilderRowCount(3);
    H.tableInteractiveBody().within(() => {
      cy.findByText("4,784").should("be.visible"); // Gizmo
      cy.findByText("Doohickey").should("not.exist");
    });

    cy.log("filter the aggregation from its column header");
    H.tableHeaderClick("Count");
    H.popover().findByText("Filter by this column").click();
    H.selectFilterOperator("Equal to");
    H.clickActionsPopover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("4939");
      cy.realPress("Tab");
      cy.button("Add filter").should("be.enabled").click();
    });
    H.queryBuilderFiltersPanel()
      .findByText(/^Count is equal to 4,?939$/)
      .should("be.visible");
    H.assertQueryBuilderRowCount(1);
    H.tableInteractiveBody().findByText("Gadget").should("be.visible");
  });

  it("should filter an aggregation from its column header on a question with one stage (metabase#30312)", () => {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              { "base-type": "type/DateTime", "temporal-unit": "month" },
            ],
          ],
          limit: 5,
        },
        display: "table",
      },
      { visitQuestion: true },
    );

    H.tableHeaderClick("Count");
    H.popover().findByText("Filter by this column").click();
    H.selectFilterOperator("Equal to");
    H.clickActionsPopover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("10");
      cy.realPress("Tab");
      cy.button("Add filter").should("be.enabled").click();
    });

    H.queryBuilderFiltersPanel()
      .findByTestId("filter-pill")
      .should("have.text", "Count is equal to 10");
    H.queryBuilderMain().findByText("No results").should("be.visible");
  });

  it("should add a filter to the first stage of a question summarized twice (metabase#15620)", () => {
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
    H.popover().within(() => {
      cy.findByText("Category").click();
      cy.findByText("Gizmo").click();
      cy.button("Apply filter").click();
    });
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

  it("post-aggregation filter shouldn't affect the drill-through options (metabase#18770)", () => {
    H.createQuestion(
      {
        name: "18770",
        query: {
          "source-query": {
            aggregation: [["count"]],
            "source-table": ORDERS_ID,
            breakout: [
              ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
            ],
          },
          filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
        },
      },
      { visitQuestion: true },
    );

    H.openNotebook();
    // It is important to manually trigger "visualize" in order to generate the `result_metadata`
    // Otherwise, we might get false negative even when this issue gets resolved.
    // In order to do that, we have to change the breakout field first or it will never generate and send POST /api/dataset request.
    cy.findAllByTestId("notebook-cell-item")
      .contains(/Products? → Title/)
      .click();
    H.popover().findByText("Category").click();
    cy.findAllByTestId("notebook-cell-item").contains(/Products? → Category/);

    H.visualize();

    cy.findAllByTestId("cell-data")
      .filter(":contains(4,784)")
      .should("have.length", 1);

    // Querying the cell again to ensure the dom node stability
    H.tableInteractiveBody().findByText("4,784").click();
    H.popover().within(() => {
      cy.findByText("Filter by this value").should("be.visible");
      cy.findAllByRole("button")
        .should("have.length", 7)
        .and("contain", "See these Orders")
        .and("contain", "Break out by")
        .and("contain", "Copy value")
        .and("contain", "<")
        .and("contain", ">")
        .and("contain", "=")
        .and("contain", "≠");
    });
  });

  it("should combine GUI and custom expression filters in the notebook and remove one of them (metabase#16198)", () => {
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

    H.getNotebookStep("filter").icon("add").click();
    H.clauseStepPopover().findByText(/^ID$/i).click();
    cy.findByPlaceholderText("Enter an ID").type("1");
    cy.button("Add filter").click();

    H.getNotebookStep("filter")
      .findByText("Total is equal to 123")
      .parent()
      .find(".Icon-close")
      .click();

    H.getNotebookStep("filter").within(() => {
      cy.findByText("Total is equal to 123").should("not.exist");
      cy.findByText(/^Total is less than/).should("be.visible");
      cy.findByText("ID is 1").should("be.visible");
    });

    H.visualize((response) => {
      expect(response.body.error).to.not.exist;
    });
    H.queryBuilderMain().findByText("Something went wrong").should("not.exist");
  });

  it("should add and edit filters from a column header without replacing other filters (metabase#16621, metabase#24664)", () => {
    H.openProductsTable({ limit: 3 });

    H.tableHeaderClick("Category");
    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search the list").type("Gadget");
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.queryBuilderFiltersPanel().findByText("Category is Gadget").click();
    H.popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Update filter").click();
    });
    H.queryBuilderFiltersPanel()
      .findByText("Category is 2 selections")
      .should("be.visible");

    H.tableHeaderClick("Category");
    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });
    H.queryBuilderFiltersPanel().findByText("Category is Doohickey").click();
    H.popover().within(() => {
      cy.findByText("Widget").click();
      cy.button("Update filter").click();
    });

    H.queryBuilderFiltersPanel()
      .findAllByTestId("filter-pill")
      .should("have.length", 2)
      .and("contain", "Category is 2 selections");

    assertPillValues({
      index: 0,
      checked: ["Gadget", "Gizmo"],
      unchecked: ["Doohickey", "Widget"],
    });
    assertPillValues({
      index: 1,
      checked: ["Doohickey", "Widget"],
      unchecked: ["Gadget", "Gizmo"],
    });
  });

  it("should filter by excluded and relative dates (metabase#21979, metabase#12457)", () => {
    H.openProductsTable({ mode: "notebook" });

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Exclude…").click();
      cy.findByText("Days of the week…").click();
      cy.findByLabelText("Monday").click();
      cy.button("Add filter").click();
    });
    H.getNotebookStep("filter")
      .findByText("Created At excludes Mondays")
      .should("be.visible");

    H.visualize();
    // "Practical Bronze Computer" is created on a Monday
    H.assertQueryBuilderRowCount(170);
    H.queryBuilderMain()
      .findByText("Practical Bronze Computer")
      .should("not.exist");

    H.queryBuilderFiltersPanel()
      .findByText("Created At excludes Mondays")
      .click();
    H.popover().within(() => {
      cy.findByLabelText("Monday").click();
      cy.findByLabelText("Thursday").click();
      cy.button("Update filter").click();
    });
    H.assertQueryBuilderRowCount(180);
    H.queryBuilderMain()
      .findByText("Practical Bronze Computer")
      .should("be.visible");
    H.queryBuilderFiltersPanel()
      .findByText("Created At excludes Thursdays")
      .should("be.visible");

    cy.log(
      "a relative date filter survives a round trip through a custom expression",
    );
    H.openOrdersTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Relative date range…").click();
      cy.findByText("Previous").click();
      cy.findByLabelText(/^Include/).click();
      cy.button("Add filter").click();
    });

    H.getNotebookStep("filter")
      .findByText("Created At is in the previous 30 days or today")
      .click();
    H.clauseStepPopover().within(() => {
      cy.button("Back").click();
      cy.button("Back").click();
      cy.findByText("Custom Expression").click();
      cy.button("Update").click();
    });

    H.getNotebookStep("filter")
      .findByText("Created At is in the previous 30 days or today")
      .click();
    H.popover()
      .findByTestId("include-current-interval-option")
      .should("have.attr", "aria-checked", "true");
  });

  it("should convert GUI filters to custom expressions and keep the results (metabase#14959)", () => {
    H.openReviewsTable();
    H.tableHeaderClick("Reviewer");
    H.popover().findByText("Filter by this column").click();
    H.selectFilterOperator("Is empty");
    H.popover().button("Add filter").click();
    H.queryBuilderMain().contains("Showing 0 rows");

    H.queryBuilderFiltersPanel().findByText("Reviewer is empty").click();
    H.popover().within(() => {
      cy.icon("chevronleft").click();
      cy.findByText("Custom Expression").click();
    });
    H.popover().contains("isEmpty([Reviewer])");
    H.CustomExpressionEditor.clear().type("NOT IsEmpty([Reviewer])").blur();
    cy.button("Update").click();
    H.queryBuilderMain().contains("Showing 1,112 rows");

    cy.log("is empty on a numeric column converts to isNull");
    H.tableHeaderClick("Rating");
    H.popover().findByText("Filter by this column").click();
    H.selectFilterOperator("Is empty");
    H.popover().button("Add filter").click();
    H.queryBuilderMain().contains("Showing 0 rows");

    H.queryBuilderFiltersPanel().findByText("Rating is empty").click();
    H.popover().within(() => {
      cy.icon("chevronleft").click();
      cy.findByText("Custom Expression").click();
    });
    H.popover().contains("isNull([Rating])");
    H.CustomExpressionEditor.clear()
      .type("NOT IsNull([Rating])", { delay: 50 })
      .blur();
    cy.button("Update").should("not.be.disabled").click();
    H.queryBuilderMain().contains("Showing 1,112 rows");

    cy.log("case-insensitive filters keep their option");
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
    H.queryBuilderMain().findByText("wilma-muller").should("be.visible");

    H.queryBuilderFiltersPanel().findByText("Reviewer contains MULLER").click();
    H.popover().within(() => {
      cy.icon("chevronleft").click();
      cy.findByText("Custom Expression").click();
    });
    H.popover().contains('contains([Reviewer], "MULLER", "case-insensitive")');
    cy.intercept("POST", "/api/dataset").as("caseInsensitiveQuery");
    cy.button("Update").click();
    cy.wait("@caseInsensitiveQuery")
      .its("response.body.data.rows")
      .should("have.length", 1);
    H.assertQueryBuilderRowCount(1);
    H.queryBuilderMain().findByText("wilma-muller").should("be.visible");
  });

  it("should filter remapped, coerced and custom datetime columns (metabase#13235, QUE-2567)", () => {
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    cy.request("POST", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });
    cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
      coercion_strategy: "Coercion/UNIXSeconds->DateTime",
      semantic_type: null,
    });

    cy.log("filter by a remapped value");
    H.openOrdersTable();
    H.filter();
    H.popover().within(() => {
      cy.findByText("Product ID").click();
      cy.findByText("Aerodynamic Linen Coat").click();
      cy.intercept("POST", "/api/dataset").as("remappedFilterQuery");
      cy.button("Apply filter").click();
    });
    cy.wait("@remappedFilterQuery");
    H.queryBuilderMain().within(() => {
      cy.findAllByText("148.23").should("have.length.at.least", 1); // one of the subtotals for this product
      cy.findAllByText("Fantastic Wool Shirt").should("not.exist");
    });

    cy.log("edit date filters on a coerced column and on custom expressions");
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            Foo: [
              "datetime-add",
              [
                "field",
                ORDERS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "effective-type": "type/DateTime",
                },
              ],
              5,
              "day",
            ],
            Bar: ["datetime", "2028-12-24"],
          },
        },
      },
      { visitQuestion: true },
    );
    ["Foo", "Bar", "Quantity"].forEach((columnName) => {
      H.filter();
      H.popover().within(() => {
        cy.findByText(columnName).click();
        cy.findByText("Previous 12 months").click();
      });
    });

    cy.findAllByTestId("filter-pill").should("have.length", 3);
    ["Foo", "Bar", "Quantity"].forEach((columnName) => {
      H.queryBuilderFiltersPanel()
        .findByText(`${columnName} is in the previous 12 months`)
        .click();
      H.popover().within(() => {
        cy.findByText("Previous").should("be.visible");
        cy.findByText("Current").should("be.visible");
        cy.findByText("Next").should("be.visible");
      });
    });
  });

  it("should search the values of a key that points to a large text column without crashing (metabase#32985)", () => {
    cy.request("PUT", `/api/field/${REVIEWS.REVIEWER}`, {
      semantic_type: "type/PK",
    });
    cy.request("PUT", `/api/field/${PEOPLE.EMAIL}`, {
      semantic_type: "type/FK",
    });
    cy.request("PUT", `/api/field/${PEOPLE.EMAIL}`, {
      fk_target_field_id: REVIEWS.REVIEWER,
    });
    H.createQuestion(
      { query: { "source-table": PEOPLE_ID, limit: 2 } },
      { visitQuestion: true },
    );

    H.tableHeaderClick("Email");
    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search by Email or enter an ID").type("foo");
    });
    H.popover()
      .should("have.length", 2)
      .last()
      .findByText("No matching Email found.")
      .should("be.visible");
  });

  it("should filter a native question by a time column (metabase#22730)", () => {
    H.createNativeQuestion(
      {
        name: "22730",
        native: {
          query:
            "select '14:02:13'::time \"time\", 'before-row' \"name\" union all select '14:06:13'::time \"time\", 'after-row' ",
        },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("qb-header-action-panel")
      .findByText("Explore results")
      .click();

    H.tableHeaderClick("time");
    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByDisplayValue("00:00").clear().type("14:03");
      cy.button("Add filter").click();
    });

    H.assertQueryBuilderRowCount(1);
    H.tableInteractiveBody().within(() => {
      cy.findByText("before-row").should("be.visible");
      cy.findByText("after-row").should("not.exist");
    });
  });

  it("should handle the keyboard in the custom expression editor (metabase#16210)", () => {
    H.openReviewsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    H.popover().findByText("Custom Expression").click();

    cy.log("Enter does not submit an invalid expression");
    H.enterCustomColumnDetails({ formula: "[Rating] > 2E{enter}" });
    H.expressionEditorWidget()
      .findByText("Missing exponent")
      .should("be.visible");
    H.getNotebookStep("filter")
      .findByText("Rating is greater than 2")
      .should("not.exist");

    cy.log("arrow keys move the highlighted suggestion");
    H.enterCustomColumnDetails({ formula: "c", blur: false });
    H.CustomExpressionEditor.completions().should("contain", "case");
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

    cy.log("suggestions highlight the matching characters");
    H.enterCustomColumnDetails({ formula: "[B", blur: false });
    H.CustomExpressionEditor.completion("Body").should("be.visible");
    H.CustomExpressionEditor.type("{backspace}p", { focus: false });
    H.CustomExpressionEditor.completion("Product ID")
      .findByText("P")
      .should("be.visible");
    H.CustomExpressionEditor.completion("Product ID")
      .findByText("roduct ID")
      .should("be.visible");

    cy.log("a function searched in the filter picker opens with its template");
    H.openOrdersTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    H.popover().findByPlaceholderText("Find...").type("case(");
    H.CustomExpressionEditor.value().should("equal", "case(condition, output)");

    cy.log("Tab accepts a suggestion and then indents");
    H.CustomExpressionEditor.clear();
    H.CustomExpressionEditor.focus().type("[Ta");
    H.CustomExpressionEditor.acceptCompletion("tab");
    cy.focused().should("have.attr", "role", "textbox");
    H.CustomExpressionEditor.type("> 42");
    cy.realPress("Tab");
    cy.focused().should("have.attr", "role", "textbox");
    H.CustomExpressionEditor.value().should("equal", "[Tax]> 42  ");

    cy.log("Escape hides the suggestions");
    H.CustomExpressionEditor.clear();
    H.CustomExpressionEditor.focus().type("Disc");
    H.CustomExpressionEditor.completions().should("be.visible");
    cy.realPress("Escape");
    H.CustomExpressionEditor.completions().should("not.be.visible");
  });

  describe("layout", () => {
    it("filter pill should not overflow the window width when the filter string is very long (metabase#44435)", () => {
      // The string must not contain spaces.
      const longString = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(10);

      H.visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": REVIEWS_ID,
            fields: [
              ["field", REVIEWS.REVIEWER, { "base-type": "type/Text" }],
              ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
            ],
            filter: [
              "=",
              ["field", REVIEWS.BODY, { "base-type": "type/Text" }],
              longString,
            ],
          },
          parameters: [],
        },
      });

      cy.findByTestId("filter-pill").then(($pill) => {
        const pillWidth = $pill[0].getBoundingClientRect().width;
        cy.window().its("innerWidth").should("be.gt", pillWidth);
      });
    });

    it("user shouldn't need to scroll to add filter (metabase#14307)", () => {
      cy.viewport(1280, 720);
      H.openPeopleTable({ mode: "notebook" });
      H.filter({ mode: "notebook" });
      H.popover().findByText("State").click({ force: true });
      H.popover().findByText("AL").click();
      cy.button("Add filter").isVisibleInPopover();
    });

    it("should render the item selected with the keyboard in view", () => {
      cy.viewport(1280, 320);
      H.openReviewsTable({ mode: "notebook" });
      H.filter({ mode: "notebook" });

      Cypress._.times(7, () => cy.realPress("ArrowDown"));

      H.popover()
        .findByRole("tree")
        .then((el) => {
          cy.wrap(el[0].scrollTop).should("be.greaterThan", 0);
        });

      H.popover().findByText("Created At").should("be.visible");
    });

    it("should render an outline on the custom expression item in the filter popover (QUE-1359)", () => {
      H.openReviewsTable({ mode: "notebook" });
      H.filter({ mode: "notebook" });

      Cypress._.times(10, () => cy.realPress("ArrowDown"));

      H.popover()
        .findByText("Custom Expression")
        .parent()
        .then((el) => {
          cy.wrap(window.getComputedStyle(el[0]).outline).should(
            "contain",
            "solid",
          );
        });
    });

    it("tooltip content should not overflow the tooltip (metabase#50731)", () => {
      cy.viewport(800, 800);
      H.openOrdersTable();
      cy.icon("filter").click();
      cy.icon("label").realHover();

      H.popover()
        .should("be.visible")
        .and(($element) => {
          const [container] = $element;
          const descendants = container.querySelectorAll("*");

          descendants.forEach((descendant) => {
            H.assertDescendantNotOverflowsContainer(descendant, container);
          });
        });
    });

    it("should keep the popover width while typing (metabase#49321)", () => {
      H.openProductsTable({ mode: "notebook" });
      H.filter({ mode: "notebook" });

      H.popover().within(() => {
        cy.findByText("Title").click();
        cy.findByText("Is").click();
      });
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.popover().last().findByText("Contains").click();

      H.popover().then(($popover) => {
        const { width } = $popover[0].getBoundingClientRect();
        cy.wrap(width).as("initialWidth");
      });

      H.popover()
        .findByPlaceholderText("Enter some text")
        .type("aaaaaaaaaa, bbbbbbbbbbb,");

      cy.get<number>("@initialWidth").then((initialWidth) => {
        H.popover().should(($popover) => {
          const { width } = $popover[0].getBoundingClientRect();
          expect(width).to.eq(initialWidth);
        });
      });
    });

    it("should not overflow the filter popover, even when there are a lot of values (metabase#48851)", () => {
      const manyValues = Array(20)
        .fill(0)
        .map(() => Math.round(Math.random() * 1000_000_000_000).toString(36))
        .join(", ");

      cy.viewport(1050, 500);
      H.openProductsTable();
      H.tableHeaderClick("Title");

      H.popover().within(() => {
        cy.findByText("Filter by this column").click();
        cy.findByText("Is").click();
      });

      H.popover().eq(1).findByText("Contains").click();
      H.popover().should("have.length", 1);
      H.popover()
        .findByPlaceholderText("Enter some text")
        .type(manyValues, { force: true, timeout: 0 });

      H.popover().button("Add filter").should("be.visible");
    });

    it("it should not lose padding when switching filter types (metabase#58923)", () => {
      cy.viewport(800, 800);
      H.openPeopleTable();
      H.tableHeaderClick("Name");

      H.popover().findByText("Filter by this column").click();
      H.popover().findByText("Is").click();
      H.popover()
        .should("have.length", 2)
        .last()
        .findByText("Contains")
        .click();

      H.popover().findByText("Contains").click();
      H.popover().should("have.length", 2).last().findByText("Is").click();

      H.popover()
        .first()
        .within(() => {
          cy.findByPlaceholderText("Search by Name").then((input) => {
            cy.button("Add filter")
              .parent()
              .then((footer) => {
                const { bottom } = input[0].getBoundingClientRect();
                const { top } = footer[0].getBoundingClientRect();

                cy.wrap(top - bottom).should("be.gt", 16);
              });
          });
        });
    });

    it("should not overflow the last filter value with the info icon (metabase#45410)", () => {
      H.openPeopleTable({ mode: "notebook" });
      H.filter({ mode: "notebook" });
      H.clauseStepPopover().within(() => {
        cy.findByText("Email").click();
        cy.findByPlaceholderText("Search by Email")
          .type("abc@example.com,abc2@example.com")
          .blur();
        cy.findByText("abc2@example.com")
          .next("button")
          .then(([removeButton]) => {
            cy.icon("info").then(([infoIcon]) => {
              const removeButtonRect = removeButton.getBoundingClientRect();
              const infoIconRect = infoIcon.getBoundingClientRect();
              expect(removeButtonRect.right).to.be.lte(infoIconRect.left);
            });
          });
      });
    });

    it("should display long column names in search results (metabase#31340)", () => {
      const LONG_COLUMN_NAME =
        "Some very very very very long column name that should have a line break";

      cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
      cy.intercept("GET", `/api/field/${PEOPLE.PASSWORD}/search/*`).as(
        "search",
      );

      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: PEOPLE_ID,
        fieldId: PEOPLE.PASSWORD,
      });
      H.DataModel.FieldSection.getNameInput()
        .focus()
        .clear()
        .type(LONG_COLUMN_NAME)
        .blur();
      cy.wait("@fieldUpdate");

      H.createQuestion(
        { query: { "source-table": PEOPLE_ID, limit: 2 } },
        { visitQuestion: true },
      );

      H.tableHeaderClick(LONG_COLUMN_NAME);
      H.popover().findByText("Filter by this column").click();
      H.selectFilterOperator("Is");
      H.popover().within(() => {
        cy.findByPlaceholderText(`Search by ${LONG_COLUMN_NAME}`).type(
          "nonexistingvalue",
        );
        cy.wait("@search");
      });

      H.popover()
        .should("have.length", 2)
        .last()
        .findByText(`No matching ${LONG_COLUMN_NAME} found.`)
        .should("be.visible")
        .and(([message]) => {
          expect(message.scrollWidth).to.be.lte(message.clientWidth);
        });
    });

    it("should truncate a long column name and keep the operator picker inside the filter popover (metabase#85298)", () => {
      const LONG_COLUMN_NAME =
        "What Are The Main Reasons For Rating This Product";

      cy.request("PUT", `/api/field/${PRODUCTS.TITLE}`, {
        display_name: LONG_COLUMN_NAME,
      });

      H.openProductsTable();
      H.filter();
      H.popover().findByText(LONG_COLUMN_NAME).click();
      H.selectFilterOperator("Contains");

      H.popover()
        .should("have.length", 1)
        .then(([popover]) => {
          H.popover()
            .findByText(LONG_COLUMN_NAME)
            .should(([columnName]) => {
              expect(columnName.scrollWidth).to.be.gt(columnName.clientWidth);
            });
          H.popover()
            .findByLabelText("Filter operator")
            .should(([operatorPicker]) => {
              H.assertDescendantNotOverflowsContainer(operatorPicker, popover);
            })
            .findByText("Contains")
            .should(([operatorLabel]) => {
              expect(operatorLabel.scrollWidth).to.be.lte(
                operatorLabel.clientWidth,
              );
            });
        });
    });
  });
});

describe(
  "scenarios > filters > unsupported column types",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "many_data_types" });
      cy.signInAsAdmin();
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "many_data_types" });
      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    it("should allow using is-null and not-null operators with unsupported data types (metabase#45252,metabase#38111)", () => {
      H.startNewQuestion();

      cy.log("filter picker - new filter");
      H.miniPicker().within(() => {
        cy.findByText("Writable Postgres12").click();
        cy.findByText("Many Data Types").click();
      });
      H.getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();
      H.popover().within(() => {
        cy.findByText("Binary").scrollIntoView().click();
        cy.findByLabelText("Is empty").click();
        cy.button("Add filter").click();
      });
      H.visualize();
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(0);

      cy.log("filter picker - existing filter");
      cy.findByTestId("qb-filters-panel").findByText("Binary is empty").click();
      H.popover().within(() => {
        cy.findByLabelText("Not empty").click();
        cy.button("Update filter").click();
        cy.wait("@dataset");
      });
      cy.findByTestId("qb-filters-panel")
        .findByText("Binary is not empty")
        .should("be.visible");
      H.assertQueryBuilderRowCount(2);

      cy.log("filter picker - existing filter");
      H.queryBuilderHeader()
        .button(/Filter/)
        .click();
      H.popover().within(() => {
        cy.findByText("Binary").click();
        cy.findByLabelText("Is empty").click();
        cy.button("Apply filter").click();
      });
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(0);

      cy.log("filter picker - json column");
      H.queryBuilderFiltersPanel()
        .findByText("Binary is empty")
        .icon("close")
        .click();
      cy.wait("@dataset");
      H.queryBuilderHeader()
        .button(/Filter/)
        .click();
      H.popover().within(() => {
        cy.findByText("Jsonb").click();
        cy.findByLabelText("Not empty").click();
        cy.button("Apply filter").click();
      });
      cy.wait("@dataset");
      H.assertQueryBuilderRowCount(2);
    });
  },
);

function assertPillValues({
  index,
  checked,
  unchecked,
}: {
  index: number;
  checked: string[];
  unchecked: string[];
}) {
  H.queryBuilderFiltersPanel()
    .findAllByTestId("filter-pill")
    .should("have.length", 2)
    .eq(index)
    .click();
  H.popover().within(() => {
    checked.forEach((value) =>
      cy.findByRole("checkbox", { name: value }).should("be.checked"),
    );
    unchecked.forEach((value) =>
      cy.findByRole("checkbox", { name: value }).should("not.be.checked"),
    );
  });
  cy.realPress("Escape");
  cy.get(H.POPOVER_ELEMENT).should("not.exist");
}
