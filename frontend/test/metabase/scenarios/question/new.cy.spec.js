import {
  enterCustomColumnDetails,
  openOrdersTable,
  openReviewsTable,
  popover,
  restore,
  visualize,
  summarize,
  startNewQuestion,
  visitQuestion,
  visitQuestionAdhoc,
} from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// test various entry points into the query builder

describe("scenarios > question > new", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("data picker", () => {
    it("data selector popover should not be too small (metabase#15591)", () => {
      // Add 10 more databases
      for (let i = 0; i < 10; i++) {
        cy.request("POST", "/api/database", {
          engine: "h2",
          name: "Sample" + i,
          details: {
            db: "zip:./target/uberjar/metabase.jar!/sample-database.db;USER=GUEST;PASSWORD=guest",
          },
          auto_run_queries: false,
          is_full_sync: false,
          schedules: {},
        });
      }

      startNewQuestion();

      cy.contains("Pick your starting data");
      cy.findByText("Sample3").isVisibleInPopover();
    });

    it("new question data picker search should work for both saved questions and database tables", () => {
      cy.intercept("GET", "/api/search?q=*", cy.spy().as("searchQuery")).as(
        "search",
      );

      startNewQuestion();

      cy.get(".List-section")
        .should("have.length", 2)
        .and("contain", "Sample Database")
        .and("contain", "Saved Questions");

      // should not trigger search for an empty string
      cy.findByPlaceholderText("Search for a table…").type("  ").blur();
      cy.findByPlaceholderText("Search for a table…").type("ord");
      cy.wait("@search");
      cy.get("@searchQuery").should("have.been.calledOnce");

      // Search results include both saved questions and database tables
      cy.findAllByTestId("search-result-item").should(
        "have.length.at.least",
        4,
      );

      cy.contains("Saved question in Our analytics");
      cy.findAllByRole("link", { name: "Our analytics" })
        .should("have.attr", "href")
        .and("eq", "/collection/root");

      cy.contains("Table in Sample Database");
      cy.findAllByRole("link", { name: "Sample Database" })
        .should("have.attr", "href")
        .and("eq", `/browse/${SAMPLE_DB_ID}-sample-database`);

      // Discarding the search qquery should take us back to the original selector
      // that starts with the list of databases and saved questions
      cy.findByPlaceholderText("Search for a table…")
        .next()
        .find(".Icon-close")
        .click();

      cy.findByText("Saved Questions").click();

      // Search is now scoped to questions only
      cy.findByPlaceholderText("Search for a question…");
      cy.findByTestId("select-list")
        .as("rightSide")
        // should display the collection tree on the left side
        .should("contain", "Orders")
        .and("contain", "Orders, Count");

      cy.get("@rightSide")
        .siblings()
        .should("have.length", 1)
        .as("leftSide")
        // should display the collection tree on the left side
        .should("contain", "Our analytics")
        .and("contain", "Your personal collection")
        .and("contain", "All personal collections");

      cy.findByText("Orders, Count").click();
      cy.findByText("Orders").should("not.exist");
      visualize();
      cy.findByText("18,760");
      // should reopen saved question picker after returning back to editor mode
      cy.icon("notebook").click();
      cy.findByTestId("data-step-cell").contains("Orders, Count").click();
      // It is now possible to choose another saved question
      cy.findByText("Orders");
      cy.findByText("Saved Questions").click();
      popover().contains("Sample Database").click();
      cy.findByText("Products").click();
      cy.findByTestId("data-step-cell").contains("Products");
      visualize();
      cy.findByText("Rustic Paper Wallet");
    });
  });

  describe("ask a (simple) question", () => {
    it.skip("should handle (removing) multiple metrics when one is sorted (metabase#13990)", () => {
      cy.intercept("POST", `/api/dataset`).as("dataset");

      cy.createQuestion(
        {
          name: "12625",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [
              ["count"],
              ["sum", ["field", ORDERS.SUBTOTAL, null]],
              ["sum", ["field", ORDERS.TOTAL, null]],
            ],
            breakout: [
              ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ],
            "order-by": [["desc", ["aggregation", 1]]],
          },
        },
        { visitQuestion: true },
      );

      summarize();

      // CSS class of a sorted header cell
      cy.get("[class*=TableInteractive-headerCellData--sorted]").as(
        "sortedCell",
      );

      // At this point only "Sum of Subtotal" should be sorted
      cy.get("@sortedCell").its("length").should("eq", 1);
      removeMetricFromSidebar("Sum of Subtotal");

      cy.wait("@dataset");
      cy.findByText("Sum of Subtotal").should("not.exist");

      // "Sum of Total" should not be sorted, nor any other header cell
      cy.get("@sortedCell").its("length").should("eq", 0);

      removeMetricFromSidebar("Sum of Total");

      cy.wait("@dataset");
      cy.findByText(/No results!/i).should("not.exist");
      cy.contains("744"); // `Count` for year 2016
    });

    it("should remove `/notebook` from URL when converting question to SQL/Native (metabase#12651)", () => {
      openOrdersTable();

      cy.url().should("include", "question#");
      // Isolate icons within "QueryBuilder" scope because there is also `.Icon-sql` in top navigation
      cy.get(".QueryBuilder .Icon-notebook").click();
      cy.url().should("include", "question/notebook#");
      cy.get(".QueryBuilder .Icon-sql").click();
      cy.findByText("Convert this question to SQL").click();
      cy.url().should("include", "question#");
    });

    it("composite keys should act as filters on click (metabase#13717)", () => {
      cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
        semantic_type: "type/PK",
      });

      openOrdersTable();

      cy.get(".TableInteractive-cellWrapper--lastColumn") // Quantity (last in the default order for Sample Database)
        .eq(1) // first table body cell
        .should("contain", "2") // quantity for order ID#1
        .click();
      cy.wait("@dataset");

      cy.get(
        "#main-data-grid .TableInteractive-cellWrapper--firstColumn",
      ).should("have.length.gt", 1);

      cy.log(
        "**Reported at v0.34.3 - v0.37.0.2 / probably was always like this**",
      );
      cy.log(
        "**It should display the table with all orders with the selected quantity.**",
      );
      cy.get(".TableInteractive");

      cy.get(".TableInteractive-cellWrapper--firstColumn") // ID (first in the default order for Sample Database)
        .eq(1) // first table body cell
        .should("contain", 1)
        .click();
      cy.wait("@dataset");

      cy.log("only one row should appear after filtering by ID");
      cy.get(
        "#main-data-grid .TableInteractive-cellWrapper--firstColumn",
      ).should("have.length", 1);
    });

    // flaky test (#19454)
    it.skip("should show an info popover when hovering over summarize dimension options", () => {
      openReviewsTable();

      summarize();
      cy.findByText("Group by")
        .parent()
        .findByText("Title")
        .trigger("mouseenter");

      popover().contains("Title");
      popover().contains("199 distinct values");
    });
  });

  describe("ask a (custom) question", () => {
    it("should show a table info popover when hovering over the table name in the header", () => {
      visitQuestion(1);

      cy.findByTestId("question-table-badges").trigger("mouseenter");

      cy.findByText("9 columns");
    });

    it("should allow using `Custom Expression` in orders metrics (metabase#12899)", () => {
      openOrdersTable({ mode: "notebook" });
      summarize({ mode: "notebook" });
      popover().contains("Custom Expression").click();
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
      summarize({ mode: "notebook" });
      popover().contains("Custom Expression").click();
      popover().within(() => {
        cy.get(".ace_text-input").type(FORMULA).blur();

        cy.log("Fails after blur in v0.36.6");
        // Implicit assertion
        cy.contains(FORMULA);
      });
    });

    it("distinct inside custom expression should suggest non-numeric types (metabase#13469)", () => {
      openReviewsTable({ mode: "notebook" });
      summarize({ mode: "notebook" });
      popover().contains("Custom Expression").click();

      enterCustomColumnDetails({ formula: "Distinct([R" });

      cy.log(
        "**The point of failure for ANY non-numeric value reported in v0.36.4**",
      );
      // the default type for "Reviewer" is "No semantic type"
      popover().within(() => {
        cy.contains("Reviewer");
      });
    });

    it("summarizing by distinct datetime should allow granular selection (metabase#13098)", () => {
      // Go straight to orders table in custom questions
      openOrdersTable({ mode: "notebook" });

      summarize({ mode: "notebook" });
      popover().within(() => {
        cy.findByText("Number of distinct values of ...").click();
        cy.log(
          "**Test fails at this point as there isn't an extra field next to 'Created At'**",
        );
        // instead of relying on DOM structure that might change
        // (i.e. find "Created At" -> parent -> parent -> parent -> find "by month")
        // access it directly from the known common parent
        cy.get(".List-item").contains("by month").click({ force: true });
      });
      // this should be among the granular selection choices
      cy.findByText("Hour of Day").click();
    });
  });

  it("'read-only' user should be able to resize column width (metabase#9772)", () => {
    cy.signIn("readonly");
    visitQuestion(1);

    cy.findByText("Tax")
      .closest(".TableInteractive-headerCellData")
      .as("headerCell")
      .then($cell => {
        const originalWidth = $cell[0].getBoundingClientRect().width;

        // Retries the assertion a few times to ensure it waits for DOM changes
        // More context: https://github.com/metabase/metabase/pull/21823#discussion_r855302036
        function assertColumnResized(attempt = 0) {
          cy.get("@headerCell").then($newCell => {
            const newWidth = $newCell[0].getBoundingClientRect().width;
            if (newWidth === originalWidth && attempt < 3) {
              cy.wait(100);
              assertColumnResized(++attempt);
            } else {
              expect(newWidth).to.be.gt(originalWidth);
            }
          });
        }

        cy.wrap($cell)
          .find(".react-draggable")
          .trigger("mousedown", 0, 0, { force: true })
          .trigger("mousemove", 100, 0, { force: true })
          .trigger("mouseup", 100, 0, { force: true });

        assertColumnResized();
      });
  });

  it("should handle ad-hoc question with old syntax (metabase#15372)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: ["=", ["field-id", ORDERS.USER_ID], 1],
        },
        database: SAMPLE_DB_ID,
      },
    });

    cy.findByText("User ID is 1");
    cy.findByText("37.65");
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
