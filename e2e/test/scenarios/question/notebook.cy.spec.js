import {
  addCustomColumn,
  addSummaryField,
  addSummaryGroupingField,
  enterCustomColumnDetails,
  filter,
  filterField,
  getNotebookStep,
  join,
  openNotebook,
  openOrdersTable,
  openProductsTable,
  openTable,
  popover,
  restore,
  startNewQuestion,
  summarize,
  visitQuestionAdhoc,
  visualize,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > question > notebook", { tags: "@slow" }, () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shouldn't offer to save the question when there were no changes (metabase#13470)", () => {
    openOrdersTable();
    // save question initially
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    cy.get(".ModalBody").contains("Save").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not now").click();
    // enter "notebook" and visualize without changing anything
    cy.icon("notebook").click();

    cy.button("Visualize").click();

    // there were no changes to the question, so we shouldn't have the option to "Save"
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").should("not.exist");
  });

  it("should allow post-aggregation filters", () => {
    openTable({
      table: ORDERS_ID,
      mode: "notebook",
    });

    cy.findByRole("button", { name: "Summarize" }).click();

    // count orders by user id, filter to the one user with 46 orders
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Pick the metric").click();
    popover().within(() => {
      cy.findByText("Count of rows").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Pick a column to group by").click();
    popover().within(() => {
      cy.contains("User ID").click();
    });
    cy.findByTestId("step-summarize-0-0").within(() => {
      cy.icon("filter").click();
    });
    popover().within(() => {
      cy.icon("int").click();
      cy.findByPlaceholderText("Enter a number").type("46");
      cy.contains("Add filter").click();
    });

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("2372"); // user's id in the table
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 1 row"); // ensure only one user was returned
  });

  it("shouldn't show sub-dimensions for FK (metabase#16787)", () => {
    openOrdersTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();

    popover().within(() => {
      cy.findByText("User ID")
        .findByLabelText("Binning strategy")
        .should("not.exist");
      cy.findByText("User ID")
        .findByLabelText("Temporal bucket")
        .should("not.exist");
    });
  });

  it("should show the original custom expression filter field on subsequent click (metabase#14726)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          filter: ["between", ["field", ORDERS.ID, null], 96, 97],
        },
        type: "query",
      },
      display: "table",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("ID is between 96 and 97").click();
    cy.findByDisplayValue("Between").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Is not");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Greater than");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Less than");
  });

  it("should append indexes to duplicate custom expression names (metabase#12104)", () => {
    cy.viewport(1920, 800); // we're looking for a column name beyond the right of the default viewport
    cy.intercept("POST", "/api/dataset").as("dataset");
    openProductsTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    addSimpleCustomColumn("EXPR");

    getNotebookStep("expression").within(() => {
      cy.icon("add").click();
    });
    addSimpleCustomColumn("EXPR");

    getNotebookStep("expression").within(() => {
      cy.icon("add").click();
    });
    addSimpleCustomColumn("EXPR");

    getNotebookStep("expression").within(() => {
      cy.findByText("EXPR");
      cy.findByText("EXPR (1)");
      cy.findByText("EXPR (2)");
    });

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("EXPR");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("EXPR (1)");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("EXPR (2)");
  });

  it("should process the updated expression when pressing Enter", () => {
    openProductsTable({ mode: "notebook" });
    filter({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    enterCustomColumnDetails({ formula: "[Price] > 1" });
    cy.get("@formula").blur();

    cy.button("Done").click();

    // change the corresponding custom expression
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Price is greater than 1").click();
    cy.get(".Icon-chevronleft").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    cy.get("@formula").clear().type("[Price] > 1 AND [Price] < 5{enter}");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(/^Price is less than 5/i);
  });

  it("should show the real number of rows instead of HARD_ROW_LIMIT when loading (metabase#17397)", () => {
    cy.intercept(
      {
        method: "POST",
        url: "/api/dataset",
        middleware: true,
      },
      req => {
        req.on("response", res => {
          // Throttle the response to 500 Kbps to simulate a mobile 3G connection
          res.setThrottle(500);
        });
      },
    ).as("dataset");

    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        filter: ["=", ["field", ORDERS.PRODUCT_ID, null], 2],
      },
    };

    cy.createQuestion(questionDetails, { visitQuestion: true });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 98 rows");

    cy.findByTestId("filters-visibility-control").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID is 2").click();

    popover().findByRole("textbox").type("3{enter}{enter}");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID is 2 selections");

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 175 rows");
  });

  // flaky test (#19454)
  it.skip("should show an info popover for dimensions listened by the custom expression editor", () => {
    // start a custom question with orders
    startNewQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sample Database").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Orders").click();

    // type a dimension name
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add filters to narrow your answer").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    enterCustomColumnDetails({ formula: "Total" });

    // hover over option in the suggestion list
    cy.findByTestId("expression-suggestions-list")
      .findByText("Total")
      .trigger("mouseenter");

    // confirm that the popover is shown
    popover().contains("The total billed amount.");
    popover().contains("80.36");
  });

  describe.skip("popover rendering issues (metabase#15502)", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      cy.viewport(1280, 720);
      startNewQuestion();
      cy.findByTextEnsureVisible("Sample Database").click();
      cy.findByTextEnsureVisible("Orders").click();
    });

    it("popover should not render outside of viewport regardless of the screen resolution (metabase#15502-1)", () => {
      // Initial filter popover usually renders correctly within the viewport
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filters to narrow your answer").as("filter").click();
      popover().isRenderedWithinViewport();
      // Click anywhere outside this popover to close it because the issue with rendering happens when popover opens for the second time
      cy.icon("gear").click();
      cy.get("@filter").click();
      popover().isRenderedWithinViewport();
    });

    it("popover should not cover the button that invoked it (metabase#15502-2)", () => {
      // Initial summarize/metric popover usually renders initially without blocking the button
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick the metric you want to see").as("metric").click();
      // Click outside to close this popover
      cy.icon("gear").click();
      // Popover invoked again blocks the button making it impossible to click the button for the third time
      cy.get("@metric").click();
      cy.get("@metric").click();
    });
  });

  describe("arithmetic (metabase#13175)", () => {
    beforeEach(() => {
      openOrdersTable({ mode: "notebook" });
    });

    it("should work on custom column with `case`", () => {
      cy.icon("add_data").click();

      enterCustomColumnDetails({
        formula: "case([Subtotal] + Tax > 100, 'Big', 'Small')",
      });

      cy.findByPlaceholderText("Something nice and descriptive")
        .click()
        .type("Example", { delay: 100 });

      cy.button("Done").should("not.be.disabled").click();

      visualize();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Example");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Big");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Small");
    });

    it("should work on custom filter", () => {
      filter({ mode: "notebook" });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Custom Expression").click();

      enterCustomColumnDetails({ formula: "[Subtotal] - Tax > 140" });
      cy.get("@formula").blur();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(/^redundant input/i).should("not.exist");

      cy.button("Done").should("not.be.disabled").click();

      visualize();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Showing 97 rows");
    });

    const CASES = {
      CountIf: ["CountIf(([Subtotal] + [Tax]) > 10)", "18,760"],
      SumIf: ["SumIf([Subtotal], ([Subtotal] + [Tax] > 20))", "1,447,850.28"],
    };

    Object.entries(CASES).forEach(([filter, formula]) => {
      const [expression, result] = formula;

      it(`should work on custom aggregation with ${filter}`, () => {
        summarize({ mode: "notebook" });
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Custom Expression").click();

        enterCustomColumnDetails({ formula: expression });

        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type(filter, { delay: 100 });

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains(/^expected closing parenthesis/i).should("not.exist");
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains(/^redundant input/i).should("not.exist");

        cy.button("Done").should("not.be.disabled").click();

        visualize();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains(filter);
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains(result);
      });
    });
  });

  // intentional simplification of "Select none" to quickly
  // fix users' pain caused by the inability to unselect all columns
  it("select no columns select the first one", () => {
    openTable({
      table: ORDERS_ID,
      mode: "notebook",
    });

    cy.findByTestId("fields-picker").click();

    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByLabelText("ID").should("be.disabled");
      cy.findByText("Tax").click();
      cy.findByLabelText("ID").should("be.enabled").click();
    });

    cy.findByTestId("step-data-0-0").findByText("Data").click(); //Dismiss popover

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Tax");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("ID").should("not.exist");
  });

  it("should treat max/min on a name as a string filter (metabase#21973)", () => {
    const questionDetails = {
      name: "21973",
      query: {
        "source-table": PEOPLE_ID,
        aggregation: [["max", ["field", PEOPLE.NAME, null]]],
        breakout: [["field", PEOPLE.SOURCE, null]],
      },
      display: "table",
    };

    cy.createQuestion(questionDetails, { visitQuestion: true });

    filter();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summaries").click();

    filterField("Max of Name", {
      operator: "Starts with",
    });
  });

  it("should treat max/min on a category as a string filter (metabase#22154)", () => {
    const questionDetails = {
      name: "22154",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["min", ["field", PRODUCTS.VENDOR, null]]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      display: "table",
    };

    cy.createQuestion(questionDetails, { visitQuestion: true });

    filter();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summaries").click();
    filterField("Min of Vendor", {
      operator: "ends with",
    });
  });

  it("should prompt to join with a model if the question is based on a model", () => {
    cy.intercept("GET", "/api/table/*/query_metadata").as("loadMetadata");

    cy.createQuestion({
      name: "Products model",
      query: { "source-table": PRODUCTS_ID },
      dataset: true,
      display: "table",
    });

    cy.createQuestion(
      {
        name: "Orders model",
        query: { "source-table": ORDERS_ID },
        dataset: true,
        display: "table",
      },
      { visitQuestion: true },
    );

    openNotebook();

    join();
    popover().findByText("Products model").click();

    visualize();
  });

  // flaky test
  it.skip("should show an info popover when hovering over a field picker option for a table", () => {
    startNewQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Sample Database").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Orders").click();

    cy.findByTestId("fields-picker").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Total").trigger("mouseenter");

    popover().contains("The total billed amount.");
    popover().contains("80.36");
  });

  // flaky test
  it.skip("should show an info popover when hovering over a field picker option for a saved question", () => {
    cy.createNativeQuestion({
      name: "question a",
      native: { query: "select 'foo' as a_column" },
    });

    // start a custom question with question a
    startNewQuestion();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Saved Questions").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("question a").click();

    cy.findByTestId("fields-picker").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("A_COLUMN").trigger("mouseenter");

    popover().contains("A_COLUMN");
    popover().contains("No description");
  });

  it(
    "should allow to pick a saved question when there are models",
    { tags: "@flaky" },
    () => {
      cy.createNativeQuestion({
        name: "Orders, Model",
        dataset: true,
        native: { query: "SELECT * FROM ORDERS" },
      });

      startNewQuestion();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Saved Questions").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders, Count").click();
      visualize();
    },
  );

  it('should not show "median" aggregation option for databases that do not support "percentile-aggregations" driver feature', () => {
    startNewQuestion();
    popover().within(() => {
      cy.contains("Raw Data").click();
      cy.contains("Orders").click();
    });

    getNotebookStep("summarize")
      .findByText("Pick the metric you want to see")
      .click();

    popover().within(() => {
      cy.findByText("Median of ...").should("not.exist");
    });
  });

  describe('"median" aggregation function', { tags: "@external" }, () => {
    beforeEach(() => {
      restore("postgres-12");
      cy.signInAsAdmin();

      cy.request(`/api/database/${WRITABLE_DB_ID}/schema/public`).then(
        ({ body }) => {
          const tableId = body.find(table => table.name === "products").id;
          openTable({
            database: WRITABLE_DB_ID,
            table: tableId,
            mode: "notebook",
          });
        },
      );
    });

    it('should show "median" aggregation option for databases that support "percentile-aggregations" driver feature', () => {
      cy.findByRole("button", { name: "Summarize" }).click();

      addSummaryField({ metric: "Median of ...", field: "Price" });

      getNotebookStep("summarize")
        .findByText("Median of Price")
        .should("be.visible");

      addSummaryGroupingField({ field: "Category" });

      visualize();

      cy.findAllByTestId("header-cell").should("contain", "Median of Price");
    });

    it("should support custom columns", () => {
      // startNewQuestion();
      // popover().within(() => {
      //   cy.findByText("QA Postgres12").click();
      //   cy.findByText("Products").click();
      // });

      addCustomColumn();
      enterCustomColumnDetails({
        formula: "Price * 10",
        name: "Mega price",
      });
      cy.button("Done").click();

      cy.findByRole("button", { name: "Summarize" }).click();

      addSummaryField({ metric: "Median of ...", field: "Mega price" });
      addSummaryField({ metric: "Count of rows" });
      addSummaryGroupingField({ field: "Category" });
      addSummaryGroupingField({ field: "Vendor" });

      summarize({ mode: "notebook" });

      addSummaryField({
        metric: "Median of ...",
        field: "Median of Mega price",
        stage: 1,
      });
      addSummaryField({ metric: "Median of ...", field: "Count", stage: 1 });
      addSummaryGroupingField({ field: "Category", stage: 1 });

      visualize();

      cy.findAllByTestId("header-cell")
        .should("contain", "Median of Median of Mega price")
        .should("contain", "Median of Count");
    });

    it("should support Summarize side panel", () => {
      // startNewQuestion();
      // popover().within(() => {
      //   cy.findByText("QA Postgres12").click();
      //   cy.findByText("Products").click();
      // });

      visualize();

      summarize();

      cy.findByTestId("add-aggregation-button").click();

      popover().within(() => {
        cy.findByText("Median of ...").should("be.visible");
      });
    });
  });

  it("should properly render previews (metabase#28726), (metabase#29959)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByTestId("step-data-0-0").within(() => {
      cy.icon("play").click();
      assertTableRowCount(10);
      cy.findByTextEnsureVisible("Subtotal");
      cy.findByTextEnsureVisible("Tax");
      cy.findByTextEnsureVisible("Total");
      cy.icon("close").click();
    });

    cy.button("Row limit").click();
    cy.findByTestId("step-limit-0-0").within(() => {
      cy.findByPlaceholderText("Enter a limit").type("5");

      cy.icon("play").click();
      assertTableRowCount(5);

      cy.findByDisplayValue("5").type("{selectall}50");
      cy.button("Refresh").click();
      assertTableRowCount(10);
    });
  });
});

function assertTableRowCount(expectedCount) {
  cy.get(".Table-ID:not(.Table-FK)").should("have.length", expectedCount);
}

function addSimpleCustomColumn(name) {
  enterCustomColumnDetails({ formula: "C" });
  cy.findByText("ategory").click();
  cy.findByPlaceholderText("Something nice and descriptive").click().type(name);
  cy.button("Done").click();
}
