import {
  restore,
  openOrdersTable,
  openProductsTable,
  popover,
  modal,
  visitQuestionAdhoc,
  interceptPromise,
} from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

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
    cy.contains("Sample Dataset").click();
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
    cy.contains("Visualize").click();
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

  it("should show the correct number of function arguments in a custom expression", () => {
    openProductsTable({ mode: "notebook" });
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable='true']")
      .click()
      .clear()
      .type("contains([Category])", { delay: 50 });
    cy.button("Done")
      .should("not.be.disabled")
      .click();
    cy.contains(/^Function contains expects 2 arguments/i);
  });

  it("should show the correct number of CASE arguments in a custom expression", () => {
    openProductsTable({ mode: "notebook" });
    cy.findByText("Custom column").click();
    popover().within(() => {
      cy.get("[contenteditable='true']").type("CASE([Price]>0)");
      cy.findByPlaceholderText("Something nice and descriptive")
        .click()
        .type("Sum Divide");
      cy.contains(/^CASE expects 2 arguments or more/i);
    });
  });

  it("should process the updated expression when pressing Enter", () => {
    openProductsTable({ mode: "notebook" });
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable='true']")
      .click()
      .clear()
      .type("[Price] > 1");
    cy.button("Done").click();

    // change the corresponding custom expression
    cy.findByText("Price is greater than 1").click();
    cy.get(".Icon-chevronleft").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable='true']")
      .click()
      .clear()
      .type("[Price] > 1 AND [Price] < 5{enter}");
    cy.contains(/^Price is less than 5/i);
  });

  it("should show the real number of rows instead of HARD_ROW_LIMIT when loading", () => {
    // start a custom question with orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Orders").click();

    // Add filter for ID < 100
    cy.findByText("Add filters to narrow your answer").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable='true']")
      .click()
      .clear()
      .type("ID < 100", { delay: 50 });
    cy.button("Done")
      .should("not.be.disabled")
      .click();
    cy.contains("Visualize").click();

    cy.contains("Showing 99 rows");

    const req = interceptPromise("POST", "/api/dataset");
    cy.contains("ID is less than 100").click();
    cy.get(".Icon-chevronleft").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable='true']")
      .click()
      .clear()
      .type("ID < 2010");
    cy.button("Done").click();
    cy.contains("Showing 99 rows");
    req.resolve();
    cy.contains("Showing first 2000 rows");
  });

  describe.skip("popover rendering issues (metabase#15502)", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      cy.viewport(1280, 720);
      cy.visit("/question/new");
      cy.findByText("Custom question").click();
      cy.findByText("Sample Dataset").click();
      cy.findByText("Orders").click();
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

      cy.button("Visualize").click();
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
      cy.get("[contenteditable='true']")
        .click()
        .clear()
        .type("case([Subtotal] + Tax > 100, 'Big', 'Small')", { delay: 50 });
      cy.findByPlaceholderText("Something nice and descriptive")
        .click()
        .type("Example", { delay: 100 });

      cy.button("Done")
        .should("not.be.disabled")
        .click();

      cy.button("Visualize").click();
      cy.contains("Example");
      cy.contains("Big");
      cy.contains("Small");
    });

    it("should work on custom filter", () => {
      cy.findByText("Filter").click();
      cy.findByText("Custom Expression").click();

      cy.get("[contenteditable='true']")
        .click()
        .clear()
        .type("[Subtotal] - Tax > 140", { delay: 50 });

      cy.contains(/^redundant input/i).should("not.exist");

      cy.button("Done")
        .should("not.be.disabled")
        .click();

      cy.button("Visualize").click();
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

        cy.get("[contenteditable='true']")
          .click()
          .clear()
          .type(expression, { delay: 50 });

        cy.findByPlaceholderText("Name (required)")
          .click()
          .type(filter, { delay: 100 });

        cy.contains(/^expected closing parenthesis/i).should("not.exist");
        cy.contains(/^redundant input/i).should("not.exist");

        cy.button("Done")
          .should("not.be.disabled")
          .click();

        cy.button("Visualize").click();
        cy.contains(filter);
        cy.contains(result);
      });
    });
  });

  describe("error feedback", () => {
    it("should catch mismatched parentheses", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      popover().within(() => {
        cy.get("[contenteditable='true']").type("FLOOR [Price]/2)");
        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type("Massive Discount");
        cy.contains(/^Expecting an opening parenthesis after function FLOOR/i);
      });
    });

    it("should catch missing parentheses", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      popover().within(() => {
        cy.get("[contenteditable='true']").type("LOWER [Vendor]");
        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type("Massive Discount");
        cy.contains(/^Expecting an opening parenthesis after function LOWER/i);
      });
    });

    it("should catch invalid characters", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      popover().within(() => {
        cy.get("[contenteditable='true']").type("[Price] / #");
        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type("Massive Discount");
        cy.contains(/^Invalid character: #/i);
      });
    });

    it("should catch unterminated string literals", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Filter").click();
      cy.findByText("Custom Expression").click();
      cy.get("[contenteditable='true']")
        .click()
        .clear()
        .type('[Category] = "widget', { delay: 50 });
      cy.button("Done")
        .should("not.be.disabled")
        .click();
      cy.findByText("Missing closing quotes");
    });

    it("should catch unterminated field reference", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      popover().within(() => {
        cy.get("[contenteditable='true']").type("[Price / 2");
        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type("Massive Discount");
        cy.contains(/^Missing a closing bracket/i);
      });
    });

    it("should catch non-existent field reference", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      popover().within(() => {
        cy.get("[contenteditable='true']").type("abcdef");
        cy.findByPlaceholderText("Something nice and descriptive")
          .click()
          .type("Non-existent");
        cy.contains(/^Unknown Field: abcdef/i);
      });
    });
  });

  describe("typing suggestion", () => {
    it("should not suggest arithmetic operators", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      cy.get("[contenteditable='true']").type("[Price] ");
      cy.contains("/").should("not.exist");
    });

    it("should correctly accept the chosen field suggestion", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      cy.get("[contenteditable='true']").type(
        "[Rating]{leftarrow}{leftarrow}{leftarrow}",
      );

      // accept the only suggested item, i.e. "[Rating]"
      cy.get("[contenteditable='true']").type("{enter}");

      // if the replacement is correct -> "[Rating]"
      // if the replacement is wrong -> "[Rating] ng"
      cy.get("[contenteditable='true']")
        .contains("[Rating] ng")
        .should("not.exist");
    });

    it("should correctly accept the chosen function suggestion", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      cy.get("[contenteditable='true']").type("LTRIM([Title])");

      // Place the cursor between "is" and "empty"
      cy.get("[contenteditable='true']").type(
        Array(13)
          .fill("{leftarrow}")
          .join(""),
      );

      // accept the first suggested function, i.e. "length"
      cy.get("[contenteditable='true']").type("{enter}");

      cy.get("[contenteditable='true']").contains("length([Title])");
    });
  });

  describe("help text", () => {
    it("should appear while inside a function", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      cy.get("[contenteditable='true']").type("Lower(");
      cy.findByText("lower(text)");
    });

    it("should not appear while outside a function", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      cy.get("[contenteditable='true']").type("Lower([Category])");
      cy.findByText("lower(text)").should("not.exist");
    });

    it("should appear after a field reference", () => {
      openProductsTable({ mode: "notebook" });
      cy.findByText("Custom column").click();
      cy.get("[contenteditable='true']").type("Lower([Category]");
      cy.findByText("lower(text)");
    });
  });

  it("should correctly insert function suggestion with the opening parenthesis", () => {
    openProductsTable({ mode: "notebook" });
    cy.findByText("Custom column").click();
    cy.get("[contenteditable='true']").type("LOW{enter}");
    cy.get("[contenteditable='true']").contains("lower(");
  });
});
