import {
  enterCustomColumnDetails,
  getNotebookStep,
  interceptPromise,
  modal,
  openOrdersTable,
  openProductsTable,
  popover,
  restore,
  visitQuestionAdhoc,
  visualize,
} from "__support__/e2e/cypress";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > question > notebook", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("shouldn't offer to save the question when there were no changes (metabase#13470)", () => {
    openOrdersTable();
    // save question initially
    cy.findByText("Save").click();
    cy.get(".ModalBody")
      .contains("Save")
      .click();
    cy.findByText("Not now").click();
    // enter "notebook" and visualize without changing anything
    cy.icon("notebook").click();

    cy.button("Visualize").click();

    // there were no changes to the question, so we shouldn't have the option to "Save"
    cy.findByText("Save").should("not.exist");
  });

  it("should allow post-aggregation filters", () => {
    // start a custom question with orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Orders").click();

    // count orders by user id, filter to the one user with 46 orders
    cy.contains("Pick the metric").click();
    popover().within(() => {
      cy.findByText("Count of rows").click();
    });
    cy.contains("Pick a column to group by").click();
    popover().within(() => {
      cy.contains("User ID").click();
    });
    cy.icon("filter").click();
    popover().within(() => {
      cy.icon("int").click();
      cy.get("input").type("46");
      cy.contains("Add filter").click();
    });

    visualize();

    cy.contains("2372"); // user's id in the table
    cy.contains("Showing 1 row"); // ensure only one user was returned
  });

  it("shouldn't show sub-dimensions for FK (metabase#16787)", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByText("Summarize").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("User ID")
      .closest(".List-item")
      .find(".Field-extra")
      .should("not.have.descendants", "*");
  });

  it("should show the original custom expression filter field on subsequent click (metabase#14726)", () => {
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          filter: ["between", ["field", ORDERS.ID, null], 96, 97],
        },
        type: "query",
      },
      display: "table",
    });

    cy.wait("@dataset");
    cy.findByText("ID between 96 97").click();
    cy.findByText("Between").click();
    popover().within(() => {
      cy.contains("Is not");
      cy.contains("Greater than");
      cy.contains("Less than");
    });
  });

  it("should append indexes to duplicate custom expression names (metabase#12104)", () => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    openProductsTable({ mode: "notebook" });

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

    cy.findByText("EXPR");
    cy.findByText("EXPR (1)");
    cy.findByText("EXPR (2)");
  });

  it("should process the updated expression when pressing Enter", () => {
    openProductsTable({ mode: "notebook" });
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();
    enterCustomColumnDetails({ formula: "[Price] > 1" });

    cy.button("Done").click();

    // change the corresponding custom expression
    cy.findByText("Price is greater than 1").click();
    cy.get(".Icon-chevronleft").click();
    cy.findByText("Custom Expression").click();

    cy.get("@formula")
      .clear()
      .type("[Price] > 1 AND [Price] < 5{enter}");

    cy.contains(/^Price is less than 5/i);
  });

  it("should show the real number of rows instead of HARD_ROW_LIMIT when loading", () => {
    // start a custom question with orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Orders").click();

    // Add filter for ID < 100
    cy.findByText("Add filters to narrow your answer").click();
    cy.findByText("Custom Expression").click();
    enterCustomColumnDetails({ formula: "ID < 100" });
    cy.button("Done")
      .should("not.be.disabled")
      .click();

    visualize();

    cy.contains("Showing 99 rows");

    const req = interceptPromise("POST", "/api/dataset");
    cy.contains("ID is less than 100").click();
    cy.get(".Icon-chevronleft").click();
    cy.findByText("Custom Expression").click();
    cy.get("@formula")
      .clear()
      .type("ID < 2010");
    cy.button("Done").click();
    cy.contains("Showing 99 rows");
    req.resolve();
    cy.contains("Showing first 2000 rows");
  });

  // flaky test (#19454)
  it.skip("should show an info popover for dimensions listened by the custom expression editor", () => {
    // start a custom question with orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Orders").click();

    // type a dimension name
    cy.findByText("Add filters to narrow your answer").click();
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
      cy.visit("/question/new");
      cy.findByText("Custom question").click();
      cy.findByTextEnsureVisible("Sample Database").click();
      cy.findByTextEnsureVisible("Orders").click();
    });

    it("popover should not render outside of viewport regardless of the screen resolution (metabase#15502-1)", () => {
      // Initial filter popover usually renders correctly within the viewport
      cy.findByText("Add filters to narrow your answer")
        .as("filter")
        .click();
      popover().isRenderedWithinViewport();
      // Click anywhere outside this popover to close it because the issue with rendering happens when popover opens for the second time
      cy.icon("gear").click();
      cy.get("@filter").click();
      popover().isRenderedWithinViewport();
    });

    it("popover should not cover the button that invoked it (metabase#15502-2)", () => {
      // Initial summarize/metric popover usually renders initially without blocking the button
      cy.findByText("Pick the metric you want to see")
        .as("metric")
        .click();
      // Click outside to close this popover
      cy.icon("gear").click();
      // Popover invoked again blocks the button making it impossible to click the button for the third time
      cy.get("@metric").click();
      cy.get("@metric").click();
    });
  });

  describe("nested", () => {
    it("should create a nested question with post-aggregation filter", () => {
      openProductsTable({ mode: "notebook" });

      cy.findByText("Summarize").click();
      popover().within(() => {
        cy.findByText("Count of rows").click();
      });

      cy.findByText("Pick a column to group by").click();
      popover().within(() => {
        cy.findByText("Category").click();
      });

      cy.findByText("Filter").click();
      popover().within(() => {
        cy.findByText("Category").click();
        cy.findByText("Gadget").click();
        cy.findByText("Add filter").click();
      });

      visualize();

      cy.findByText("Gadget").should("exist");
      cy.findByText("Gizmo").should("not.exist");

      cy.findByText("Save").click();

      modal().within(() => {
        cy.findByLabelText("Name").type("post aggregation");
        cy.findByText("Save").click();
      });

      cy.findByText("Not now").click();

      cy.icon("notebook").click();

      cy.reload();

      cy.findByText("Category").should("exist");
      cy.findByText("Category is Gadget").should("exist");
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

      cy.button("Done")
        .should("not.be.disabled")
        .click();

      visualize();

      cy.contains("Example");
      cy.contains("Big");
      cy.contains("Small");
    });

    it("should work on custom filter", () => {
      cy.findByText("Filter").click();
      cy.findByText("Custom Expression").click();

      enterCustomColumnDetails({ formula: "[Subtotal] - Tax > 140" });

      cy.contains(/^redundant input/i).should("not.exist");

      cy.button("Done")
        .should("not.be.disabled")
        .click();

      visualize();

      cy.contains("Showing 97 rows");
    });

    const CASES = {
      CountIf: ["CountIf(([Subtotal] + [Tax]) > 10)", "18,760"],
      SumIf: ["SumIf([Subtotal], ([Subtotal] + [Tax] > 20))", "1,447,850.28"],
    };

    Object.entries(CASES).forEach(([filter, formula]) => {
      const [expression, result] = formula;

      it(`should work on custom aggregation with ${filter}`, () => {
        cy.findByText("Summarize").click();
        cy.findByText("Custom Expression").click();

        enterCustomColumnDetails({ formula: expression });

        cy.findByPlaceholderText("Name (required)")
          .click()
          .type(filter, { delay: 100 });

        cy.contains(/^expected closing parenthesis/i).should("not.exist");
        cy.contains(/^redundant input/i).should("not.exist");

        cy.button("Done")
          .should("not.be.disabled")
          .click();

        visualize();

        cy.contains(filter);
        cy.contains(result);
      });
    });
  });

  // intentional simplification of "Select none" to quickly
  // fix users' pain caused by the inability to unselect all columns
  it("select no columns select the first one", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Orders").click();
    cy.findByTestId("fields-picker").click();

    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByLabelText("ID").should("be.disabled");
      cy.findByText("Tax").click();
      cy.findByLabelText("ID")
        .should("be.enabled")
        .click();
    });

    visualize();

    cy.findByText("Tax");
    cy.findByText("ID").should("not.exist");
  });

  // flaky test
  it.skip("should show an info popover when hovering over a field picker option for a table", () => {
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Database").click();
    cy.contains("Orders").click();

    cy.findByTestId("fields-picker").click();

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
    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText("question a").click();

    cy.findByTestId("fields-picker").click();

    cy.findByText("A_COLUMN").trigger("mouseenter");

    popover().contains("A_COLUMN");
    popover().contains("No description");
  });
});

function addSimpleCustomColumn(name) {
  enterCustomColumnDetails({ formula: "C" });
  cy.findByText("ategory").click();
  cy.findByPlaceholderText("Something nice and descriptive")
    .click()
    .type(name);
  cy.button("Done").click();
}
