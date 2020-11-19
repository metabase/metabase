import {
  restore,
  signInAsAdmin,
  popover,
  openOrdersTable,
  withSampleDataset,
} from "__support__/cypress";

// test various entry points into the query builder

describe("scenarios > question > new", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  describe("browse data", () => {
    it("should load orders table and summarize", () => {
      cy.visit("/");
      cy.contains("Browse Data").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();
      cy.contains("37.65");
    });
  });

  describe("ask a (simple) question", () => {
    it("should load orders table", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Simple question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();
      cy.contains("37.65");
    });

    it.skip("should remove `/notebook` from URL when converting question to SQL/Native (metabase#12651)", () => {
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

    it.skip("should correctly choose between 'Object Detail' and 'Table (metabase#13717)", () => {
      withSampleDataset(({ ORDERS }) => {
        // set ID to `No special type`
        cy.request("PUT", `/api/field/${ORDERS.ID}`, {
          special_type: null,
        });
        // set Quantity to `Entity Key`
        cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
          special_type: "type/PK",
        });
      });

      openOrdersTable();
      // this url check is just to give some time for the render to finish
      cy.url().should("include", "/question#");

      cy.get(".TableInteractive-cellWrapper--lastColumn") // Quantity (last in the default order for Sample Dataset)
        .eq(1) // first table body cell
        .should("contain", 2) // quantity for order ID#1
        .click();

      cy.log(
        "**Reported at v0.34.3 - v0.37.0.2 / probably was always like this**",
      );
      cy.log(
        "**It should display the table with all orders with the selected quantity.**",
      );
      cy.findByText("Fantastic Wool Shirt"); // order ID#3 with the same quantity
    });

    it.skip("should display date granularity on Summarize when opened from saved question (metabase#11439)", () => {
      // save "Orders" as question
      cy.request("POST", "/api/card", {
        name: "11439",
        dataset_query: {
          database: 1,
          query: { "source-table": 2 },
          type: "query",
        },
        type: "query",
        display: "table",
        visualization_settings: {},
      });
      // it is essential for this repro to find question following these exact steps
      // (for example, visiting `/collection/root` would yield different result)
      cy.visit("/");
      cy.findByText("Ask a question").click();
      cy.findByText("Simple question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("11439").click();
      cy.findByText("Summarize").click();
      cy.findByText("Group by")
        .parent()
        .within(() => {
          cy.log("**Reported failing since v0.33.5.1**");
          cy.log(
            "**Marked as regression of [#10441](https://github.com/metabase/metabase/issues/10441)**",
          );
          cy.findByText("Created At")
            .closest(".List-item")
            .contains("by month")
            .click();
        });
      // this step is maybe redundant since it fails to even find "by month"
      cy.findByText("Hour of day");
    });
  });

  describe("ask a (custom) question", () => {
    it("should load orders table", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Custom question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();
      cy.contains("Visualize").click();
      cy.contains("37.65");
    });

    it("should allow using `Custom Expression` in orders metrics (metabase#12899)", () => {
      // go straight to "orders" in custom questions
      cy.visit("/question/new?database=1&table=2&mode=notebook");
      cy.findByText("Summarize").click();
      popover()
        .contains("Custom Expression")
        .click();
      popover().within(() => {
        cy.get("[contentEditable=true]").type("2 * Max([Total])");
        cy.findByPlaceholderText("Name (required)").type("twice max total");
        cy.findByText("Done").click();
      });
      cy.findByText("Visualize").click();
      cy.findByText("604.96");
    });

    it.skip("should keep manually entered parenthesis intact (metabase#13306)", () => {
      const FORMULA =
        "Sum([Total]) / (Sum([Product → Price]) * Average([Quantity]))";

      cy.visit("/question/new?database=1&table=2&mode=notebook");
      cy.findByText("Summarize").click();
      popover()
        .contains("Custom Expression")
        .click();
      popover().within(() => {
        cy.get("[contentEditable=true]")
          .type(FORMULA)
          .blur();

        cy.log("**Fails after blur in v0.36.6**");
        // Implicit assertion
        cy.get("[contentEditable=true]").contains(FORMULA);
      });
    });

    it.skip("distinct inside custom expression should suggest non-numeric types (metabase#13469)", () => {
      // go directly to custom question in "Reviews" table
      cy.visit("/question/new?database=1&table=4&mode=notebook");
      cy.findByText("Summarize").click();
      popover()
        .contains("Custom Expression")
        .click();

      cy.get("[contentEditable=true]")
        .click()
        .type("Distinct([R");

      cy.log(
        "**The point of failure for ANY non-numeric value reported in v0.36.4**",
      );
      // the default type for "Reviewer" is "No special type"
      cy.findByText("Fields")
        .parent()
        .contains("Reviewer");
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

    it.skip("trend visualization should work regardless of column order (metabase#13710)", () => {
      cy.server();
      withSampleDataset(({ ORDERS }) => {
        cy.request("POST", "/api/card", {
          name: "13710",
          dataset_query: {
            database: 1,
            query: {
              "source-table": 2,
              breakout: [
                ["field-id", ORDERS.QUANTITY],
                ["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"],
              ],
            },
            type: "query",
          },
          display: "smartscalar",
          visualization_settings: {},
        }).then(({ body: { id: questionId } }) => {
          cy.route("POST", `/api/card/${questionId}/query`).as("cardQuery");

          cy.visit(`/question/${questionId}`);
          cy.findByText("13710");

          cy.wait("@cardQuery");
          cy.log("**Reported failing on v0.35 - v0.37.0.2**");
          cy.log("**Bug: showing blank visualization**");
          cy.get(".ScalarValue").contains("33");
        });
      });
    });
  });
});
