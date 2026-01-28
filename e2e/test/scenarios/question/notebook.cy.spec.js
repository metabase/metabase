const { H } = cy;
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ADMIN_USER_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID, PRODUCTS, PRODUCTS_ID } =
  SAMPLE_DATABASE;

describe("scenarios > question > notebook", { tags: "@slow" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shouldn't offer to save the question when there were no changes (metabase#13470)", () => {
    H.openOrdersTable();
    // save question initially
    H.saveQuestion(undefined, undefined, {
      tab: "Browse",
      path: ["Our analytics"],
    });

    // enter "notebook" and visualize without changing anything
    H.openNotebook();

    cy.button("Visualize").click();

    // there were no changes to the question, so we shouldn't have the option to "Save"
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").should("not.exist");
  });

  it("should allow post-aggregation filters", () => {
    H.openTable({
      table: ORDERS_ID,
      mode: "notebook",
    });

    cy.findByRole("button", { name: "Summarize" }).click();

    // count orders by user id, filter to the one user with 46 orders
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Pick a function or metric").click();
    H.popover().within(() => {
      cy.findByText("Count of rows").click();
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Pick a column to group by").click();
    H.popover().within(() => {
      cy.contains("User ID").click();
    });
    cy.findByTestId("step-summarize-0-0").within(() => {
      cy.icon("filter").click();
    });
    H.popover().icon("int").click();
    H.selectFilterOperator("Equal to");
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("46");
      cy.contains("Add filter").click();
    });

    H.visualize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("2372"); // user's id in the table
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 1 row"); // ensure only one user was returned
  });

  it("shouldn't show sub-dimensions for FK (metabase#16787)", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();

    H.popover().within(() => {
      cy.findByText("User ID")
        .findByLabelText("Binning strategy")
        .should("not.exist");
      cy.findByText("User ID")
        .findByLabelText("Temporal bucket")
        .should("not.exist");
    });
  });

  it("should show the original custom expression filter field on subsequent click (metabase#14726)", () => {
    H.visitQuestionAdhoc({
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

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("ID is between 96 and 97").click();
    H.popover().findByText("Between").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Is not");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Greater than");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Less than");
  });

  it("should append indexes to duplicate custom expression names (metabase#12104)", () => {
    cy.viewport(1920, 800); // we're looking for a column name beyond the right of the default viewport
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.openProductsTable({ mode: "notebook" });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    addSimpleCustomColumn("EXPR");

    H.getNotebookStep("expression").within(() => {
      cy.icon("add").click();
    });
    addSimpleCustomColumn("EXPR");

    H.getNotebookStep("expression").within(() => {
      cy.icon("add").click();
    });
    addSimpleCustomColumn("EXPR");

    H.getNotebookStep("expression").within(() => {
      cy.findByText("EXPR");
      cy.findByText("EXPR (1)");
      cy.findByText("EXPR (2)");
    });

    H.visualize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("EXPR");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("EXPR (1)");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("EXPR (2)");
  });

  it("should show the real number of rows instead of HARD_ROW_LIMIT when loading (metabase#17397)", () => {
    cy.intercept(
      {
        method: "POST",
        url: "/api/dataset",
        middleware: true,
      },
      (req) => {
        req.on("response", (res) => {
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

    H.createQuestion(questionDetails, { visitQuestion: true });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 98 rows");

    cy.findByTestId("filters-visibility-control").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID is 2").click();

    H.popover().within(() => {
      cy.findByLabelText("Filter value").focus().type("3").blur();
      cy.button("Update filter").click();
    });
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID is 2 selections");

    cy.wait("@dataset");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.contains("Showing 175 rows");
  });

  it("should show an info popover for dimensions listened by the custom expression editor", () => {
    // start a custom question with orders
    H.openOrdersTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });

    H.popover().contains("Custom Expression").click();

    H.CustomExpressionEditor.type("[Cre");

    // hover over option in the suggestion list
    H.CustomExpressionEditor.completion("Created At")
      .parents("li")
      .findByLabelText("More info")
      .realHover();

    H.hovercard().within(() => {
      cy.contains("The date and time an order was submitted.");
      cy.contains("Creation timestamp");
    });
  });

  it("should show an info card filter columns in the popover", () => {
    H.openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Add filters to narrow your answer").click();

    cy.findByRole("tree")
      .findByText("User ID")
      .parents("[data-testid='dimension-list-item']")
      .findByLabelText("More info")
      .realHover();

    H.hovercard().within(() => {
      cy.contains("Foreign Key");
      cy.findByText(/The id of the user/);
    });
  });

  describe("popover rendering issues (metabase#15502)", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      cy.viewport(1280, 720);
      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });
    });

    it("popover should not render outside of viewport regardless of the screen resolution (metabase#15502-1)", () => {
      H.getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();

      H.popover().isRenderedWithinViewport();
      // Click anywhere outside this popover to close it because the issue with rendering happens when popover opens for the second time
      H.getProfileLink().click();
      H.getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();
      H.popover().isRenderedWithinViewport();
    });

    it("popover should not cover the button that invoked it (metabase#15502-2)", () => {
      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
      // Click outside to close this popover
      H.getProfileLink().click();
      // Popover invoked again blocks the button making it impossible to click the button for the third time
      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
    });
  });

  describe("arithmetic (metabase#13175, metabase#18094)", () => {
    beforeEach(() => {
      // This is required because TableInteractive won't render columns
      // that don't fit into the viewport
      cy.viewport(1400, 1000);
      H.openOrdersTable({ mode: "notebook" });
    });

    it("should work on custom column with `case`", () => {
      cy.findByLabelText("Custom column").click();

      H.enterCustomColumnDetails({
        formula: "case([Subtotal] + Tax > 100, 'Big', 'Small')",
      });

      H.CustomExpressionEditor.nameInput()
        .focus()
        .type("Example", { delay: 100 });

      cy.button("Done").should("not.be.disabled").click();

      H.getNotebookStep("expression").contains("Example").should("exist");

      H.visualize();

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("Example");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("Big");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("Small");
    });

    it("should work on custom filter", () => {
      H.filter({ mode: "notebook" });
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Custom Expression").click();

      H.enterCustomColumnDetails({ formula: "[Subtotal] - Tax > 140" });

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains(/^redundant input/i).should("not.exist");

      cy.button("Done").should("not.be.disabled").click();

      H.visualize();

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
        H.summarize({ mode: "notebook" });
        H.popover().contains("Custom Expression").click();

        H.enterCustomColumnDetails({ formula: expression });

        H.CustomExpressionEditor.nameInput().click().type(filter);

        H.popover().within(() => {
          cy.contains(/^expected closing parenthesis/i).should("not.exist");
          cy.contains(/^redundant input/i).should("not.exist");
        });
        cy.button("Done").should("not.be.disabled").click();

        cy.findByTestId("aggregate-step").contains(filter).should("exist");

        H.visualize();

        cy.findByTestId("qb-header").contains(filter);
        cy.findByTestId("query-builder-main").contains(result);
      });
    });
  });

  // intentional simplification of "Select none" to quickly
  // fix users' pain caused by the inability to unselect all columns
  it("select no columns select the first one", () => {
    H.openTable({
      table: ORDERS_ID,
      mode: "notebook",
    });

    cy.findByTestId("fields-picker").click();

    H.popover().within(() => {
      cy.findByText("Select all").click();
      cy.findByLabelText("ID").should("be.disabled");
      cy.findByText("Tax").click();
      cy.findByLabelText("ID").should("be.enabled").click();
    });

    cy.findByTestId("step-data-0-0").findByText("Data").click(); //Dismiss popover

    H.visualize();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Tax");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("ID").should("not.exist");
  });

  it("should render a field info icon in the fields picker", () => {
    H.openTable({
      table: ORDERS_ID,
      mode: "notebook",
    });

    cy.findByTestId("fields-picker").click();
    H.popover().findAllByLabelText("More info").first().realHover();

    H.hovercard().contains("This is a unique ID");
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

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.filter();
    H.popover().within(() => {
      cy.findByText("Summaries").click();
      cy.findByText("Max of Name").click();
    });
    H.selectFilterOperator("Starts with");
    H.popover().findByPlaceholderText("Enter some text").should("be.visible");
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

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.filter();
    H.popover().within(() => {
      cy.findByText("Summaries").click();
      cy.findByText("Min of Vendor").click();
    });
    H.selectFilterOperator("Ends with");
    H.popover().findByPlaceholderText("Enter some text").should("be.visible");
  });

  it("should prompt to join with a model if the question is based on a model", () => {
    cy.intercept("GET", "/api/table/*/query_metadata").as("loadMetadata");

    H.createQuestion({
      name: "Products model",
      query: { "source-table": PRODUCTS_ID },
      type: "model",
      display: "table",
    });

    H.createQuestion(
      {
        name: "Orders model",
        query: { "source-table": ORDERS_ID },
        type: "model",
        display: "table",
      },
      { visitQuestion: true },
    );

    H.openNotebook();

    H.join();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("Products model").click();
    });

    H.visualize();
  });

  it('should not show "median" aggregation option for databases that do not support "percentile-aggregations" driver feature', () => {
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });

    H.getNotebookStep("summarize")
      .findByText("Pick a function or metric")
      .click();

    H.popover().within(() => {
      cy.findByText("Median of ...").should("not.exist");
    });
  });

  describe('"median" aggregation function', { tags: "@external" }, () => {
    beforeEach(() => {
      H.restore("postgres-12");
      cy.signInAsAdmin();

      cy.request(`/api/database/${WRITABLE_DB_ID}/schema/public`).then(
        ({ body }) => {
          const tableId = body.find((table) => table.name === "products").id;
          H.openTable({
            database: WRITABLE_DB_ID,
            table: tableId,
            mode: "notebook",
          });
        },
      );
    });

    it('should show "median" aggregation option for databases that support "percentile-aggregations" driver feature', () => {
      cy.findByRole("button", { name: "Summarize" }).click();

      H.addSummaryField({ metric: "Median of ...", field: "Price" });

      H.getNotebookStep("summarize")
        .findByText("Median of Price")
        .should("be.visible");

      H.addSummaryGroupingField({ field: "Category" });

      H.visualize();

      cy.findByLabelText("Switch to data").click();
      cy.findAllByTestId("header-cell").should("contain", "Median of Price");
    });

    it("should support custom columns", () => {
      H.addCustomColumn();
      H.enterCustomColumnDetails({
        formula: "Price * 10",
        name: "Mega price",
      });
      cy.button("Done").click();

      cy.findByRole("button", { name: /Summarize/ }).click();

      H.addSummaryField({ metric: "Median of ...", field: "Mega price" });
      H.addSummaryField({ metric: "Count of rows" });
      H.addSummaryGroupingField({ field: "Category" });
      H.addSummaryGroupingField({ field: "Vendor" });

      H.summarize({ mode: "notebook" });

      H.addSummaryField({
        metric: "Median of ...",
        field: "Median of Mega price",
        stage: 1,
      });
      H.addSummaryField({ metric: "Median of ...", field: "Count", stage: 1 });
      H.addSummaryGroupingField({ field: "Category", stage: 1 });

      H.visualize();

      cy.findByLabelText("Switch to data").click();
      cy.findAllByTestId("header-cell")
        .should("contain", "Median of Median of Mega price")
        .should("contain", "Median of Count");
    });

    it("should support Summarize side panel", () => {
      H.visualize();

      H.summarize();

      cy.findByTestId("add-aggregation-button").click();

      H.popover().within(() => {
        cy.findByText("Median of ...").should("be.visible");
      });
    });
  });

  it("should properly render previews (metabase#28726, metabase#29959, metabase#40608)", () => {
    H.startNewQuestion();

    cy.log(
      "Preview should not be possible without the source data (metabase#40608)",
    );
    H.getNotebookStep("data")
      .as("dataStep")
      .within(() => {
        cy.findByPlaceholderText("Search for tables and more...").should(
          "exist",
        );
        cy.icon("play").should("not.be.visible");
      });

    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });

    cy.get("@dataStep").icon("play").should("be.visible");
    H.getNotebookStep("filter").icon("play").should("not.be.visible");
    H.getNotebookStep("summarize").icon("play").should("not.be.visible");

    cy.get("@dataStep").within(() => {
      cy.icon("play").click();
      assertTableRowCount(10);
      cy.findByTextEnsureVisible("Subtotal");
      cy.findByTextEnsureVisible("Tax");
      cy.findByTextEnsureVisible("Total");
      cy.icon("close").click();
    });

    cy.button("Row limit").click();
    H.getNotebookStep("limit").within(() => {
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
      cy.findByText(name).as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", {
        horizontal,
        vertical,
      });
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      cy.findAllByTestId("notebook-cell-item")
        .eq(index)
        .should("have.text", name);
    }

    function verifyDragAndDrop() {
      H.getNotebookStep("expression").within(() => {
        moveElement({ name: "E1", horizontal: 100, index: 1 });
      });
      H.getNotebookStep("filter").within(() => {
        moveElement({ name: "ID is 2", horizontal: -100, index: 0 });
      });
      H.getNotebookStep("summarize").within(() => {
        cy.findByTestId("aggregate-step").within(() => {
          moveElement({ name: "Count", vertical: 100, index: 4 });
        });
        cy.findByTestId("breakout-step").within(() => {
          moveElement({ name: "ID", horizontal: 100, index: 1 });
        });
      });
      H.getNotebookStep("sort").within(() => {
        moveElement({ name: "Average of Total", horizontal: -100, index: 0 });
      });
    }

    function verifyPopoverDoesNotMoveElement({
      type,
      name,
      index,
      horizontal,
      vertical,
    }) {
      H.getNotebookStep(type).findByText(name).click();
      H.popover().within(() => {
        cy.findByText("Is").as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", {
          horizontal,
          vertical,
        });
      });
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.getNotebookStep(type)
        .findAllByTestId("notebook-cell-item")
        .eq(index)
        .should("have.text", name);
    }

    function verifyPopoverIsClosedAfterDragAndDrop({
      type,
      name,
      index,
      horizontal,
      vertical,
    }) {
      H.getNotebookStep(type).within(() => {
        cy.findByText(name).click();
      });
      H.popover().should("be.visible");
      H.getNotebookStep(type).within(() => {
        moveElement({ name, horizontal, vertical, index });
      });
      cy.get(H.POPOVER_ELEMENT).should("not.exist");
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
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.openNotebook();
    verifyDragAndDrop();
    verifyPopoverDoesNotMoveElement({
      type: "filter",
      name: "ID is 1",
      index: 1,
      horizontal: -100,
    });
    verifyPopoverIsClosedAfterDragAndDrop({
      type: "filter",
      name: "ID is 1",
      index: 0,
      horizontal: -100,
    });
  });

  it("should not crash notebook when metric is used as an aggregation and breakout is applied (metabase#40553)", () => {
    H.createQuestion(
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

    cy.get("@metricId").then((metricId) => {
      const questionDetails = {
        query: {
          "source-table": ORDERS_ID,
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
          aggregation: ["metric", metricId],
        },
      };

      H.createQuestion(questionDetails, { visitQuestion: true });

      H.openNotebook();

      H.getNotebookStep("summarize").contains("Revenue").click();

      H.CustomExpressionEditor.value().should("equal", "[Revenue]");
    });
  });

  it(
    "should be possible to sort by metric (metabase#8283,metabase#42392)",
    { tags: "@skip" },
    () => {
      H.createQuestion(
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

      cy.get("@metricId").then((metricId) => {
        const questionDetails = {
          query: {
            "source-table": `card__${metricId}`,
            aggregation: ["metric", metricId],
          },
        };

        H.createQuestion(questionDetails, { visitQuestion: true });

        H.openNotebook();

        cy.findByText("Pick a column to group by").click();
        cy.findByText("Created At").click();
        cy.findByText("Sort").click();

        // Sorts ascending by default
        // Revenue appears twice, but it's the only integer column to order by
        H.popover().icon("int").click();

        // Let's make sure it's possible to sort descending as well
        cy.icon("arrow_up").click();

        cy.icon("arrow_down").parent().contains("Revenue");

        H.visualize();
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

        // eslint-disable-next-line metabase/no-unsafe-element-filtering
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
    },
  );

  it("should open only one bucketing popover at a time (metabase#45036)", () => {
    H.visitQuestionAdhoc(
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

    H.getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();

    H.popover()
      .findByRole("option", { name: "Created At" })
      .findByText("by month")
      .realHover()
      .click();

    H.popover()
      .eq(1)
      .within(() => {
        cy.findByText("Year").should("be.visible");
        cy.findByText("Hour of day").should("not.exist");
        cy.findByText("More…").click();
        cy.findByText("Hour of day").should("be.visible");
      });

    H.popover()
      .eq(0)
      .findByRole("option", { name: "Price" })
      .findByText("Auto bin")
      .realHover()
      .click();

    H.popover()
      .eq(1)
      .within(() => {
        cy.findByText("Auto bin").should("be.visible");
        cy.findByText("50 bins").should("be.visible");
        cy.findByText("Don't bin").should("be.visible");

        cy.findByText("Year").should("not.exist");
        cy.findByText("Hour of day").should("not.exist");
        cy.findByText("More…").should("not.exist");
      });

    H.popover().should("have.length", 2);
  });

  it("should not leave the UI in broken state after adding an aggregation (metabase#48358)", () => {
    cy.visit("/");
    H.newButton("Question").click();
    H.miniPicker().findByText("Sample Database").click();
    H.miniPicker().findByText("Products").click();
    H.addSummaryField({ metric: "Sum of ...", field: "Price" });
    H.addSummaryGroupingField({ field: "Created At" });
    H.addSummaryGroupingField({ field: "Category" });
    H.visualize();
    H.saveQuestionToCollection();
    H.notebookButton().click();
    H.addSummaryField({ metric: "Sum of ...", field: "Rating" });
    H.visualize();
    H.saveSavedQuestion();
    H.notebookButton().click();
    cy.findByLabelText("View SQL").click();
    H.addSummaryField({ metric: "Sum of ...", field: "Price" });

    cy.findByTestId("loading-indicator").should("not.exist");
    H.NativeEditor.get(".ace_line")
      .should("include.text", 'SUM("PUBLIC"."PRODUCTS"."PRICE") AS "sum"')
      .and("include.text", 'SUM("PUBLIC"."PRODUCTS"."RATING") AS "sum_2"')
      .and("include.text", 'SUM("PUBLIC"."PRODUCTS"."PRICE") AS "sum_3"');
  });

  it("should not shrink the remove clause button (metabase#50128)", () => {
    const CUSTOM_COLUMN_LONG_NAME = "very-very-very-long-name";

    // The issue is reproducible on all viewports, but the smaller the viewport is,
    // the more likely the issue is going to occur.
    cy.viewport(300, 800);
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            [CUSTOM_COLUMN_LONG_NAME]: ["+", 1000, 1000],
          },
          filter: ["<", ["expression", CUSTOM_COLUMN_LONG_NAME, null], 1000000],
          aggregation: [["avg", ["expression", CUSTOM_COLUMN_LONG_NAME, null]]],
          breakout: [["expression", CUSTOM_COLUMN_LONG_NAME, null]],
          "order-by": [["asc", ["expression", CUSTOM_COLUMN_LONG_NAME, null]]],
        },
      },
      { visitQuestion: true },
    );
    H.openNotebook();

    H.verifyNotebookQuery("Orders", [
      {
        expressions: [CUSTOM_COLUMN_LONG_NAME],
        filters: [`${CUSTOM_COLUMN_LONG_NAME} is less than 1000000`],
        aggregations: [`Average of ${CUSTOM_COLUMN_LONG_NAME}`],
        breakouts: [CUSTOM_COLUMN_LONG_NAME],
        sort: [{ column: CUSTOM_COLUMN_LONG_NAME, order: "asc" }],
      },
    ]);

    cy.findAllByTestId("notebook-cell-item")
      .filter(`:contains(${CUSTOM_COLUMN_LONG_NAME})`)
      .then((items) => {
        for (let index = 0; index < items.length; ++index) {
          cy.wrap(items[index]).within(() => {
            assertRemoveClauseIconSize();
          });
        }
      });

    function assertRemoveClauseIconSize() {
      cy.findByLabelText("close icon").invoke("outerWidth").should("eq", 16);
      cy.findByLabelText("close icon").invoke("outerHeight").should("eq", 16);
    }
  });

  it("should let the user navigate back (metabase#50971)", () => {
    cy.visit("/model/new");
    cy.findByTestId("new-model-options")
      .findByText("Use the notebook editor")
      .click();

    H.miniPicker().should("be.visible");

    // Cypress can emulate the browser's back button with cy.go('back'), but
    // this does not trigger a confirmation modal, so we need to perform a
    // similar action that also triggers the confirmation modal: clicking the
    // cancel button in the edit bar.
    cy.log('Triggering a "Discard your changes?" confirmation modal');
    cy.findByTestId("dataset-edit-bar")
      .findByRole("button", { name: "Cancel", hidden: true })
      .click({ force: true });

    cy.log(
      'Clicking "Discard changes" in the confirmation modal to verify that this modal is above the data picker modal',
    );
    H.modal().should("be.visible").contains("Discard changes").click();
    cy.findByTestId("greeting-message").should("be.visible");
  });

  it("shows all available columns and groups in the breakout picker (metabase#46832)", () => {
    cy.visit("/");
    H.newButton("Question").click();
    H.miniPicker().findByText("Sample Database").click();
    H.miniPicker().findByText("Orders").click();
    H.join();
    H.joinTable("Reviews", "Product ID", "Product ID");
    H.addSummaryField({ metric: "Count of rows" });
    H.addSummaryGroupingField({ field: "Created At" });
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByRole("button", { name: "Join data" }).last().click();
    H.joinTable("Reviews", "Created At: Month", "Created At");
    cy.button("Summarize").click();
    H.addSummaryField({ metric: "Count of rows", stage: 1 });

    cy.log("adding a new breakout");
    H.getNotebookStep("summarize", { stage: 1 })
      .findByText("Pick a column to group by")
      .click();
    H.popover().within(() => {
      cy.findByText("Summaries").should("be.visible");
      cy.findByText("Created At: Month").should("be.visible");
      cy.findByText("Count").should("be.visible");

      cy.findByText("Reviews").click();
      cy.findByText("Created At: Month").should("not.exist");
      cy.findByText("Count").should("not.exist");

      cy.findByText("Summaries").click();
      cy.findByText("Created At: Month").should("be.visible");
      cy.findByText("Count").should("be.visible");

      cy.findByText("Reviews").click();
      cy.findByText("Rating").click();
    });

    cy.log("editing an existing breakout");
    H.getNotebookStep("summarize", { stage: 1 })
      .findByText("Reviews - Created At: Month → Rating: Auto binned")
      .click();
    H.popover().within(() => {
      cy.findByText("Summaries").should("be.visible");
      cy.findByText("Created At: Month").should("not.exist");
      cy.findByText("Count").should("not.exist");

      cy.findByText("Summaries").click();
      cy.findByText("Created At: Month").should("be.visible");
      cy.findByText("Count").should("be.visible");
    });
  });

  it("should allow using aggregation functions inside expressions in aggregation (metabase#52611)", () => {
    cy.visit("/");
    H.newButton("Question").click();
    H.miniPicker().findByText("Sample Database").click();
    H.miniPicker().findByText("Orders").click();
    H.addSummaryField({ metric: "Custom Expression" });
    H.enterCustomColumnDetails({
      formula: "case(Sum([Total]) > 10, Sum([Total]), Sum([Subtotal]))",
      name: "conditional sum",
    });
    cy.button("Done").click();
    H.addSummaryGroupingField({ field: "Total" });
    H.visualize();
    H.echartsContainer().should("contain.text", "Total: 8 bins");
  });

  it("Correctly translates aggregations", () => {
    cy.request("PUT", `/api/user/${ADMIN_USER_ID}`, {
      locale: "de",
    });

    H.openTable({
      table: ORDERS_ID,
      mode: "notebook",
    });

    cy.findByRole("button", { name: "Zusammenfassen" }).click();
    H.popover().within(() => {
      cy.findByText("Durchschnitt von...").click();
      cy.findByText("Subtotal").click();
    });

    cy.findAllByText("Durchschnitt von Subtotal").should("exist");
    cy.findAllByText("Average of Subtotal").should("not.exist");

    cy.request("PUT", `/api/user/${ADMIN_USER_ID}`, {
      locale: "en",
    });
  });

  it("should support browser based navigation (metabase#55162)", () => {
    cy.intercept(`/api/table/${PRODUCTS_ID}/fks`).as("tableFK");
    H.createQuestion(
      { query: { "source-table": PRODUCTS_ID }, name: "products" },
      { visitQuestion: true, wrapId: true },
    );

    cy.get("@questionId").then((PRODUCT_QUESTION_ID) => {
      cy.findByRole("button", { name: /Editor/ }).click();
      cy.findByRole("button", { name: /Visualization/ }).click();

      cy.go("back");
      cy.location("pathname").should(
        "equal",
        `/question/${PRODUCT_QUESTION_ID}-products/notebook`,
      );

      cy.go("back");
      cy.location("pathname").should(
        "equal",
        `/question/${PRODUCT_QUESTION_ID}-products`,
      );

      cy.go("forward");
      cy.location("pathname").should(
        "equal",
        `/question/${PRODUCT_QUESTION_ID}-products/notebook`,
      );

      H.openQuestionActions("Turn into a model");

      H.modal()
        .findByRole("button", { name: "Turn this into a model" })
        .click();

      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/notebook`,
      );

      H.openQuestionActions("Edit metadata");
      H.waitForLoaderToBeRemoved();
      H.datasetEditBar().findByRole("button", { name: "Cancel" }).click();

      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products`,
      );

      H.openQuestionActions("Edit metadata");
      H.waitForLoaderToBeRemoved();

      cy.go("back");
      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products`,
      );

      cy.go("back");

      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/columns`,
      );

      H.datasetEditBar().findByText("Query").click();

      cy.go("back");

      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/columns`,
      );

      cy.go("forward");

      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/query`,
      );

      H.datasetEditBar().findByRole("button", { name: "Cancel" }).click();

      cy.go("back");

      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products/query`,
      );

      cy.go("back");

      // This should work, but doesn't (metabase#55486)
      // cy.location("pathname").should(
      //   "equal",
      //   `/model/${PRODUCT_QUESTION_ID}-products/columns`,
      // );

      H.datasetEditBar().findByRole("button", { name: "Cancel" }).click();

      cy.findAllByTestId("row-id-cell")
        .first()
        .findByRole("button", { hidden: true })
        .click({ force: true });

      // Cannot navigate back and forth to details modal (metabase#55487)
      // cy.go("back");

      // cy.location("pathname").should(
      //   "equal",
      //   `/model/${PRODUCT_QUESTION_ID}-products`,
      // );

      // cy.go("forward");

      // cy.location("pathname").should(
      //   "equal",
      //   `/model/${PRODUCT_QUESTION_ID}-products/1`,
      // );

      /**
       * foreign key relation orders should work, but it consistently fails in CI
       */
      // cy.wait("@tableFK");

      // H.modal().findByTestId("fk-relation-orders").click();

      // cy.location("pathname").should("contain", "/question");
      // cy.findByTestId("filter-pill").should("contain.text", "Product ID is 1");

      cy.go("back");

      cy.location("pathname").should(
        "equal",
        `/model/${PRODUCT_QUESTION_ID}-products`,
      );

      H.openQuestionActions("Turn back to saved question");

      cy.location("pathname").should(
        "equal",
        `/question/${PRODUCT_QUESTION_ID}-products`,
      );

      // Going back returns us to a model URL, which it should not (metabase#55488)
      // cy.go("back");
      // cy.location("pathname").should(
      //   "not.equal",
      //   `/model/${PRODUCT_QUESTION_ID}-products`,
      // );
    });
  });

  it("should be possible to select custom expressions in the aggregation picker", () => {
    H.openOrdersTable({ mode: "notebook" });
    H.summarize({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByPlaceholderText("Find...").type("Distinc");
      cy.findByText("Number of distinct values of ...").should("be.visible");
      cy.findByText("DistinctIf").click();
      H.CustomExpressionEditor.value().should(
        "equal",
        "DistinctIf(column, condition)",
      );
    });
  });

  it("should not render detail view column in preview (metabase#63070)", () => {
    function openPreview() {
      cy.findByTestId("step-preview-button").click();
    }

    function verifyPreviewIsRendered() {
      cy.findByTestId("table-scroll-container").should("contain", "37.65");
    }

    function verifyIndexColumnsNotRendered() {
      cy.findAllByTestId("row-id-cell").should("have.length", 0);
    }

    H.openOrdersTable({ mode: "notebook" });

    openPreview();
    verifyPreviewIsRendered();
    verifyIndexColumnsNotRendered();
  });
});

function assertTableRowCount(expectedCount) {
  cy.get(".test-Table-ID:not(.test-Table-FK)").should(
    "have.length",
    expectedCount,
  );
}

function addSimpleCustomColumn(name) {
  H.enterCustomColumnDetails({ formula: "[Category]", blur: true });
  H.CustomExpressionEditor.nameInput().click().type(name);
  cy.button("Done").click();
}
