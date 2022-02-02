import {
  browse,
  enterCustomColumnDetails,
  openOrdersTable,
  openReviewsTable,
  popover,
  restore,
  visualize,
  openNotebookEditor,
} from "__support__/e2e/cypress";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// test various entry points into the query builder

describe("scenarios > question > new", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("data selector popover should not be too small (metabase#15591)", () => {
    // Add 10 more databases
    for (let i = 0; i < 10; i++) {
      cy.request("POST", "/api/database", {
        engine: "h2",
        name: "Sample" + i,
        details: {
          db:
            "zip:./target/uberjar/metabase.jar!/sample-database.db;USER=GUEST;PASSWORD=guest",
        },
        auto_run_queries: false,
        is_full_sync: false,
        schedules: {},
      });
    }

    // First test UI for Simple question
    cy.visit("/question/new");
    cy.findByText("Simple question").click();
    cy.findByText("Pick your data");
    cy.findByText("Sample3").isVisibleInPopover();

    // Then move to the Custom question UI
    cy.visit("/question/new");
    cy.findByText("Custom question").click();
    cy.findByText("Sample3").isVisibleInPopover();
  });

  it("should display a tooltip for CTA icons on an individual question (metabase#16108)", () => {
    openOrdersTable();
    cy.icon("download").realHover();
    cy.findByText("Download full results");
    cy.icon("bell").realHover();
    cy.findByText("Get alerts");
    cy.icon("share").realHover();
    cy.findByText("Sharing");
  });

  describe("browse data", () => {
    it("should load orders table and summarize", () => {
      cy.visit("/");
      browse().click();
      cy.contains("Sample Database").click();
      cy.contains("Orders").click();
      cy.contains("37.65");
    });
  });

  describe("data picker search", () => {
    beforeEach(() => {
      cy.visit("/question/new");
    });

    describe("on a (simple) question page", () => {
      beforeEach(() => {
        cy.findByText("Simple question").click();
        cy.findByPlaceholderText("Search for a table…").type("Ord");
      });

      it("should allow to search saved questions", () => {
        cy.findByText("Orders, Count").click();
        cy.findByText("18,760");
      });

      it("should allow to search and select tables", () => {
        cy.findAllByText("Orders")
          .closest("li")
          .findByText("Table in")
          .parent()
          .findByTestId("search-result-item-name")
          .click();
        cy.url().should("include", "question#");
        cy.findByText("Sample Database");
        cy.findByText("Orders");
      });
    });

    describe("on a (custom) question page", () => {
      beforeEach(() => {
        cy.findByText("Custom question").click();
        cy.findByPlaceholderText("Search for a table…").type("Ord");
      });

      it("should allow to search saved questions", () => {
        cy.findByText("Orders, Count").click();

        visualize();
        cy.findByText("18,760");
      });

      it("should allow to search and select tables", () => {
        cy.findAllByText("Orders")
          .closest("li")
          .findByText("Table in")
          .parent()
          .findByTestId("search-result-item-name")
          .click();

        visualize();

        cy.url().should("include", "question#");
        cy.findByText("Sample Database");
        cy.findByText("Orders");
      });
    });

    it("should ignore an empty search string", () => {
      cy.intercept("/api/search", req => {
        expect("Unexpected call to /api/search").to.be.false;
      });
      cy.findByText("Custom question").click();
      cy.findByPlaceholderText("Search for a table…").type("  ");
    });
  });

  describe("saved question picker", () => {
    beforeEach(() => {
      cy.visit("/question/new");
    });

    describe("on a (simple) question page", () => {
      beforeEach(() => {
        cy.findByText("Simple question").click();
        cy.findByText("Saved Questions").click();
      });

      it("should display the collection tree on the left side", () => {
        cy.findByText("Our analytics");
      });

      it("should display the saved questions list on the right side", () => {
        cy.findByText("Orders, Count, Grouped by Created At (year)");
        cy.findByText("Orders");
        cy.findByText("Orders, Count").click();
        cy.findByText("18,760");
      });

      it("should perform a search scoped to saved questions", () => {
        cy.findByPlaceholderText("Search for a question…").type("Grouped");
        cy.findByText("Orders, Count, Grouped by Created At (year)").click();
        cy.findByText("1,994");
      });
    });

    describe("on a (custom) question page", () => {
      beforeEach(() => {
        cy.findByText("Custom question").click();
        cy.findByText("Saved Questions").click();
      });

      it("should display the collection tree on the left side", () => {
        cy.findByText("Our analytics");
      });

      it("should display the saved questions list on the right side", () => {
        cy.findByText("Orders, Count, Grouped by Created At (year)");
        cy.findByText("Orders");
        cy.findByText("Orders, Count").click();

        visualize();

        cy.findByText("18,760");
      });

      it("should redisplay the saved question picker when changing a question", () => {
        cy.findByText("Orders, Count").click();

        // Try to choose a different saved question
        cy.findByTestId("data-step-cell").click();

        cy.findByText("Our analytics");
        cy.findByText("Orders");
        cy.findByText("Orders, Count, Grouped by Created At (year)").click();

        visualize();

        cy.findByText("2016");
        cy.findByText("5,834");
      });

      it("should perform a search scoped to saved questions", () => {
        cy.findByPlaceholderText("Search for a question…").type("Grouped");
        cy.findByText("Orders, Count, Grouped by Created At (year)").click();

        visualize();

        cy.findByText("2018");
      });

      it("should reopen saved question picker after returning back to editor mode", () => {
        cy.findByText("Orders, Count, Grouped by Created At (year)").click();

        visualize();

        cy.icon("notebook").click();
        cy.findByTestId("data-step-cell").click();

        cy.findByTestId("select-list").within(() => {
          cy.findByText("Orders, Count, Grouped by Created At (year)");
        });
      });
    });
  });

  describe("ask a (simple) question", () => {
    it("should load orders table", () => {
      cy.visit("/question/new");
      cy.contains("Simple question").click();
      cy.contains("Sample Database").click();
      cy.contains("Orders").click();
      cy.contains("37.65");
    });

    it.skip("should handle (removing) multiple metrics when one is sorted (metabase#13990)", () => {
      cy.createQuestion({
        name: "12625",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["count"],
            ["sum", ["field", ORDERS.SUBTOTAL, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
          "order-by": [["desc", ["aggregation", 1]]],
        },
      }).then(({ body: { id: QESTION_ID } }) => {
        cy.server();
        cy.route("POST", `/api/card/${QESTION_ID}/query`).as("cardQuery");
        cy.route("POST", `/api/dataset`).as("dataset");

        cy.visit(`/question/${QESTION_ID}`);

        cy.wait("@cardQuery");
        cy.get("button")
          .contains("Summarize")
          .click();

        // CSS class of a sorted header cell
        cy.get("[class*=TableInteractive-headerCellData--sorted]").as(
          "sortedCell",
        );

        // At this point only "Sum of Subtotal" should be sorted
        cy.get("@sortedCell")
          .its("length")
          .should("eq", 1);
        removeMetricFromSidebar("Sum of Subtotal");

        cy.wait("@dataset");
        cy.findByText("Sum of Subtotal").should("not.exist");

        // "Sum of Total" should not be sorted, nor any other header cell
        cy.get("@sortedCell")
          .its("length")
          .should("eq", 0);

        removeMetricFromSidebar("Sum of Total");

        cy.wait("@dataset");
        cy.findByText(/No results!/i).should("not.exist");
        cy.contains("744"); // `Count` for year 2016
      });
    });

    it("should remove `/notebook` from URL when converting question to SQL/Native (metabase#12651)", () => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");
      openOrdersTable();
      cy.wait("@dataset");
      cy.url().should("include", "question#");
      // Isolate icons within "QueryBuilder" scope because there is also `.Icon-sql` in top navigation
      cy.get(".QueryBuilder .Icon-notebook").click();
      cy.url().should("include", "question/notebook#");
      cy.get(".QueryBuilder .Icon-sql").click();
      cy.findByText("Convert this question to SQL").click();
      cy.url().should("include", "question#");
    });

    it("should correctly choose between 'Object Detail' and 'Table (metabase#13717)", () => {
      // set ID to `No semantic type`
      cy.request("PUT", `/api/field/${ORDERS.ID}`, {
        semantic_type: null,
      });
      // set Quantity to `Entity Key`
      cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
        semantic_type: "type/PK",
      });

      openOrdersTable();
      // this url check is just to give some time for the render to finish
      cy.url().should("include", "/question#");

      cy.get(".TableInteractive-cellWrapper--lastColumn") // Quantity (last in the default order for Sample Database)
        .eq(1) // first table body cell
        .should("contain", 2) // quantity for order ID#1
        .click();

      cy.log(
        "**Reported at v0.34.3 - v0.37.0.2 / probably was always like this**",
      );
      cy.log(
        "**It should display the table with all orders with the selected quantity.**",
      );
      cy.get(".TableInteractive");
    });

    // flaky test (#19454)
    it.skip("should show an info popover when hovering over summarize dimension options", () => {
      openReviewsTable();

      cy.findByText("Summarize").click();
      cy.findByText("Group by")
        .parent()
        .findByText("Title")
        .trigger("mouseenter");

      popover().contains("Title");
      popover().contains("199 distinct values");
    });
  });

  describe("ask a (custom) question", () => {
    it("should load orders table", () => {
      openNotebookEditor();
      cy.contains("Sample Database").click();
      cy.contains("Orders").click();

      visualize();

      cy.contains("37.65");
    });

    it("should show a table info popover when hovering over the table name in the header", () => {
      cy.visit("/question/1");

      cy.findByTestId("question-table-badges").trigger("mouseenter");

      cy.findByText("9 columns");
    });

    it("should allow using `Custom Expression` in orders metrics (metabase#12899)", () => {
      openOrdersTable({ mode: "notebook" });
      cy.findByText("Summarize").click();
      popover()
        .contains("Custom Expression")
        .click();
      popover().within(() => {
        enterCustomColumnDetails({ formula: "2 * Max([Total])" });
        cy.findByPlaceholderText("Name (required)").type("twice max total");
        cy.findByText("Done").click();
      });

      visualize();

      cy.findByText("318.7");
    });

    it.skip("should keep manually entered parenthesis intact (metabase#13306)", () => {
      const FORMULA =
        "Sum([Total]) / (Sum([Product → Price]) * Average([Quantity]))";

      openOrdersTable({ mode: "notebook" });
      cy.findByText("Summarize").click();
      popover()
        .contains("Custom Expression")
        .click();
      popover().within(() => {
        cy.get(".ace_text-input")
          .type(FORMULA)
          .blur();

        cy.log("Fails after blur in v0.36.6");
        // Implicit assertion
        cy.contains(FORMULA);
      });
    });

    it("distinct inside custom expression should suggest non-numeric types (metabase#13469)", () => {
      openReviewsTable({ mode: "notebook" });
      cy.findByText("Summarize").click();
      popover()
        .contains("Custom Expression")
        .click();

      enterCustomColumnDetails({ formula: "Distinct([R" });

      cy.log(
        "**The point of failure for ANY non-numeric value reported in v0.36.4**",
      );
      // the default type for "Reviewer" is "No semantic type"
      popover().within(() => {
        cy.contains("Reviewer");
      });
    });

    it.skip("summarizing by distinct datetime should allow granular selection (metabase#13098)", () => {
      // Go straight to orders table in custom questions
      cy.visit("/question/new?database=1&table=2&mode=notebook");

      cy.findByText("Summarize").click();
      popover().within(() => {
        cy.findByText("Number of distinct values of ...").click();
        cy.log(
          "**Test fails at this point as there isn't an extra field next to 'Created At'**",
        );
        // instead of relying on DOM structure that might change
        // (i.e. find "Created At" -> parent -> parent -> parent -> find "by month")
        // access it directly from the known common parent
        cy.get(".List-item")
          .contains("by month")
          .click({ force: true });
      });
      // this should be among the granular selection choices
      cy.findByText("Hour of day").click();
    });

    it("'read-only' user should be able to resize column width (metabase#9772)", () => {
      cy.signIn("readonly");
      cy.visit("/question/1");
      cy.findByText("Tax")
        .closest(".TableInteractive-headerCellData")
        .as("headerCell")
        .then($cell => {
          const originalWidth = $cell[0].getBoundingClientRect().width;

          cy.wrap($cell)
            .find(".react-draggable")
            .trigger("mousedown", 0, 0, { force: true })
            .trigger("mousemove", 100, 0, { force: true })
            .trigger("mouseup", 100, 0, { force: true });

          cy.findByText("Started from").click(); // Give DOM some time to update

          cy.get("@headerCell").then($newCell => {
            const newWidth = $newCell[0].getBoundingClientRect().width;

            expect(newWidth).to.be.gt(originalWidth);
          });
        });
    });
  });
});

function removeMetricFromSidebar(metricName) {
  cy.get("[class*=SummarizeSidebar__AggregationToken]")
    .contains(metricName)
    .parent()
    .find(".Icon-close")
    .should("be.visible")
    .click();
}
