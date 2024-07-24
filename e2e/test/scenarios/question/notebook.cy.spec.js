import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addCustomColumn,
  addSummaryField,
  addSummaryGroupingField,
  enterCustomColumnDetails,
  filter,
  filterField,
  getNotebookStep,
  hovercard,
  join,
  moveDnDKitElement,
  openNotebook,
  openOrdersTable,
  openProductsTable,
  openTable,
  popover,
  restore,
  selectFilterOperator,
  startNewQuestion,
  summarize,
  visitQuestionAdhoc,
  visualize,
  createQuestion,
  entityPickerModal,
  entityPickerModalTab,
} from "e2e/support/helpers";

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
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Not now").click();
    // enter "notebook" and visualize without changing anything
    openNotebook();

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
    popover().icon("int").click();
    selectFilterOperator("Equal to");
    popover().within(() => {
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

    cy.button("Done").click();

    getNotebookStep("filter").contains("Price is greater than 1").click();

    // change the corresponding custom expression
    cy.get(".Icon-chevronleft").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    cy.get("@formula")
      .invoke("val", "") // this is a more reliable .clear()
      .type("[Price] > 1 AND [Price] < 5{enter}");

    // In case it does exist, it usually is an error in expression (caused by not clearing
    // the input properly before typing), and this check helps to highlight that.
    cy.findByTestId("expression-editor-textfield").should("not.exist");

    getNotebookStep("filter")
      .contains("Price is greater than 1")
      .should("exist");
    getNotebookStep("filter").contains("Price is less than 5").should("exist");
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

    popover().within(() => {
      cy.findByLabelText("Filter value").focus().type("3").blur();
      cy.button("Update filter").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID is 2 selections");

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 175 rows");
  });

  it("should show an info popover for dimensions listened by the custom expression editor", () => {
    // start a custom question with orders
    openOrdersTable({ mode: "notebook" });
    filter({ mode: "notebook" });

    popover().contains("Custom Expression").click();

    cy.findByTestId("expression-editor-textfield").within(() => {
      cy.get(".ace_text-input").focus().type("[");
    });

    // hover over option in the suggestion list
    cy.findByTestId("expression-suggestions-list")
      .findByText("Created At")
      .parents("li")
      .findByLabelText("More info")
      .realHover();

    hovercard().within(() => {
      cy.contains("The date and time an order was submitted.");
      cy.contains("Creation timestamp");
    });
  });

  it("should show an info card filter columns in the popover", () => {
    openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add filters to narrow your answer").click();

    cy.findByRole("tree")
      .findByText("User ID")
      .parents("[data-testid='dimension-list-item']")
      .findByLabelText("More info")
      .realHover();

    hovercard().within(() => {
      cy.contains("Foreign Key");
      cy.findByText(/The id of the user/);
    });
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

  describe("arithmetic (metabase#13175, metabase#18094)", () => {
    beforeEach(() => {
      // This is required because TableInteractive won't render columns
      // that don't fit into the viewport
      cy.viewport(1400, 1000);
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

      getNotebookStep("expression").contains("Example").should("exist");

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
      SumIf2: [
        'SumIf([Total], [Created At] > "2016-01-01") + SumIf([Subtotal], [Created At] > "2016-01-01")',
        "2,958,809.85",
      ],
      CountIf2: [
        'CountIf([Created At] > "2016-01-01") + CountIf([Created At] > "2016-01-01")',
        "37,520",
      ],
    };

    Object.entries(CASES).forEach(([filter, formula]) => {
      const [expression, result] = formula;

      it(`should work on custom aggregation with ${filter}`, () => {
        summarize({ mode: "notebook" });
        popover().contains("Custom Expression").click();

        enterCustomColumnDetails({ formula: expression });

        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type(filter);

        popover().within(() => {
          cy.contains(/^expected closing parenthesis/i).should("not.exist");
          cy.contains(/^redundant input/i).should("not.exist");
        });
        cy.button("Done").should("not.be.disabled").click();

        cy.findByTestId("aggregate-step").contains(filter).should("exist");

        visualize();

        cy.findByTestId("qb-header").contains(filter);
        cy.findByTestId("query-builder-main").contains(result);
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

  it("should render a field info icon in the fields picker", () => {
    openTable({
      table: ORDERS_ID,
      mode: "notebook",
    });

    cy.findByTestId("fields-picker").click();
    popover().findAllByLabelText("More info").first().realHover();

    hovercard().contains("This is a unique ID");
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
      type: "model",
      display: "table",
    });

    cy.createQuestion(
      {
        name: "Orders model",
        query: { "source-table": ORDERS_ID },
        type: "model",
        display: "table",
      },
      { visitQuestion: true },
    );

    openNotebook();

    join();
    entityPickerModal().within(() => {
      entityPickerModalTab("Models").click();
      cy.findByText("Products model").click();
    });

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

  it("should allow to pick a saved question when there are models", () => {
    cy.createNativeQuestion({
      name: "Orders, Model",
      type: "model",
      native: { query: "SELECT * FROM ORDERS" },
    });

    startNewQuestion();

    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").click();
      cy.findByText("Orders, Count").click();
    });

    visualize();
  });

  it('should not show "median" aggregation option for databases that do not support "percentile-aggregations" driver feature', () => {
    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
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

      cy.findByLabelText("Switch to data").click();
      cy.findAllByTestId("header-cell").should("contain", "Median of Price");
    });

    it("should support custom columns", () => {
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

      cy.findByLabelText("Switch to data").click();
      cy.findAllByTestId("header-cell")
        .should("contain", "Median of Median of Mega price")
        .should("contain", "Median of Count");
    });

    it("should support Summarize side panel", () => {
      visualize();

      summarize();

      cy.findByTestId("add-aggregation-button").click();

      popover().within(() => {
        cy.findByText("Median of ...").should("be.visible");
      });
    });
  });

  it("should properly render previews (metabase#28726, metabase#29959, metabase#40608)", () => {
    startNewQuestion();

    cy.log(
      "Preview should not be possible without the source data (metabase#40608)",
    );
    getNotebookStep("data")
      .as("dataStep")
      .within(() => {
        cy.findByText("Pick your starting data").should("exist");
        cy.icon("play").should("not.be.visible");
      });

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });

    cy.get("@dataStep").icon("play").should("be.visible");
    getNotebookStep("filter").icon("play").should("not.be.visible");
    getNotebookStep("summarize").icon("play").should("not.be.visible");

    cy.get("@dataStep").within(() => {
      cy.icon("play").click();
      assertTableRowCount(10);
      cy.findByTextEnsureVisible("Subtotal");
      cy.findByTextEnsureVisible("Tax");
      cy.findByTextEnsureVisible("Total");
      cy.icon("close").click();
    });

    cy.button("Row limit").click();
    getNotebookStep("limit").within(() => {
      cy.findByPlaceholderText("Enter a limit").type("5").realPress("Tab");

      cy.icon("play").click();
      assertTableRowCount(5);

      cy.findByDisplayValue("5").type("{selectall}50").realPress("Tab");
      cy.button("Refresh").click();
      assertTableRowCount(10);
    });
  });

  it("should be able to drag-n-drop query clauses", () => {
    function moveElement({ name, horizontal, vertical, index }) {
      moveDnDKitElement(cy.findByText(name), {
        horizontal,
        vertical,
      });
      cy.findAllByTestId("notebook-cell-item")
        .eq(index)
        .should("have.text", name);
    }

    function verifyPopoverDoesNotMoveElement({
      type,
      name,
      index,
      horizontal,
      vertical,
    }) {
      getNotebookStep(type).findByText(name).click();
      popover().within(() => {
        moveDnDKitElement(cy.findByDisplayValue("Is"), {
          horizontal,
          vertical,
        });
      });
      getNotebookStep(type)
        .findAllByTestId("notebook-cell-item")
        .eq(index)
        .should("have.text", name);
    }

    const questionDetails = {
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          E1: ["+", ["field", ORDERS.ID, null], 1],
          E2: ["+", ["field", ORDERS.ID, null], 2],
        },
        filter: [
          "and",
          ["=", ["field", ORDERS.ID, null], 1],
          ["=", ["field", ORDERS.ID, null], 2],
          ["=", ["field", ORDERS.ID, null], 3],
        ],
        breakout: [
          ["field", ORDERS.ID, null],
          ["field", ORDERS.PRODUCT_ID, null],
        ],
        aggregation: [
          ["count"],
          ["sum", ["field", ORDERS.TAX, null]],
          ["sum", ["field", ORDERS.SUBTOTAL, null]],
          ["sum", ["field", ORDERS.TOTAL, null]],
          ["avg", ["field", ORDERS.TOTAL, null]],
        ],
        "order-by": [
          ["asc", ["aggregation", 0]],
          ["asc", ["aggregation", 4]],
        ],
      },
    };
    cy.createQuestion(questionDetails, { visitQuestion: true });
    openNotebook();
    getNotebookStep("expression").within(() => {
      moveElement({ name: "E1", horizontal: 100, index: 1 });
    });
    getNotebookStep("filter").within(() => {
      moveElement({ name: "ID is 2", horizontal: -100, index: 0 });
    });
    getNotebookStep("summarize").within(() => {
      cy.findByTestId("aggregate-step").within(() => {
        moveElement({ name: "Count", vertical: 100, index: 4 });
      });
      cy.findByTestId("breakout-step").within(() => {
        moveElement({ name: "ID", horizontal: 100, index: 1 });
      });
    });
    getNotebookStep("sort").within(() => {
      moveElement({ name: "Average of Total", horizontal: -100, index: 0 });
    });
    verifyPopoverDoesNotMoveElement({
      type: "filter",
      name: "ID is 1",
      index: 1,
      horizontal: -100,
    });
  });

  it("should not crash notebook when metric is used as an aggregation and breakout is applied (metabase#40553)", () => {
    cy.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
        },
        type: "metric",
        name: "Revenue",
      },
      {
        wrapId: true,
        idAlias: "metricId",
      },
    );

    cy.get("@metricId").then(metricId => {
      const questionDetails = {
        query: {
          "source-table": `card__${metricId}`,
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
          aggregation: ["metric", metricId],
        },
      };

      createQuestion(questionDetails, { visitQuestion: true });

      openNotebook();

      getNotebookStep("summarize").contains("Revenue").click();

      popover()
        .findByTestId("expression-editor-textfield")
        .contains("[Revenue]");
    });
  });

  it.skip("should be possible to sort by metric (metabase#8283,metabase#42392)", () => {
    cy.createQuestion(
      {
        name: "Revenue",
        description: "Sum of orders subtotal",
        type: "metric",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.SUBTOTAL, null]]],
        },
      },
      {
        wrapId: true,
        idAlias: "metricId",
      },
    );

    cy.get("@metricId").then(metricId => {
      const questionDetails = {
        query: {
          "source-table": `card__${metricId}`,
          aggregation: ["metric", metricId],
        },
      };

      cy.createQuestion(questionDetails, { visitQuestion: true });

      openNotebook();

      cy.findByText("Pick a column to group by").click();
      cy.findByText("Created At").click();
      cy.findByText("Sort").click();

      // Sorts ascending by default
      // Revenue appears twice, but it's the only integer column to order by
      popover().icon("int").click();

      // Let's make sure it's possible to sort descending as well
      cy.icon("arrow_up").click();

      cy.icon("arrow_down").parent().contains("Revenue");

      visualize();
      // Visualization will render line chart by default. Switch to the table.
      cy.icon("table2").click();

      cy.findAllByRole("grid").as("table");
      cy.get("@table")
        .first()
        .as("tableHeader")
        .within(() => {
          cy.get("[data-testid=cell-data]")
            .eq(1)
            .invoke("text")
            .should("eq", "Revenue");
        });

      cy.get("@table")
        .last()
        .as("tableBody")
        .within(() => {
          cy.get("[data-testid=cell-data]")
            .eq(1)
            .invoke("text")
            .should("eq", "50,072.98");
        });
    });
  });

  it.skip("should open only one bucketing popover at a time (metabase#45036)", () => {
    visitQuestionAdhoc(
      {
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: { "source-table": PRODUCTS_ID, aggregation: [["count"]] },
          parameters: [],
        },
      },
      { mode: "notebook" },
    );

    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();

    popover()
      .findByRole("option", { name: "Created At" })
      .findByText("by month")
      .click();

    popover()
      .last()
      .within(() => {
        cy.findByText("Year").should("be.visible");
        cy.findByText("Hour of day").should("not.exist");
        cy.findByText("More…").click();
        cy.findByText("Hour of day").should("be.visible");
      });

    popover()
      .first()
      .findByRole("option", { name: "Price" })
      .findByText("Auto bin")
      .click();

    popover()
      .last()
      .within(() => {
        cy.findByText("Auto bin").should("be.visible");
        cy.findByText("50 bins").should("be.visible");
        cy.findByText("Don't bin").should("be.visible");

        cy.findByText("Year").should("not.exist");
        cy.findByText("Hour of day").should("not.exist");
        cy.findByText("More…").should("not.exist");
      });
  });
});

function assertTableRowCount(expectedCount) {
  cy.get(".test-Table-ID:not(.test-Table-FK)").should(
    "have.length",
    expectedCount,
  );
}

function addSimpleCustomColumn(name) {
  enterCustomColumnDetails({ formula: "C", blur: false });
  cy.findByText("ategory").click();
  cy.findByPlaceholderText("Something nice and descriptive").click().type(name);
  cy.button("Done").click();
}
