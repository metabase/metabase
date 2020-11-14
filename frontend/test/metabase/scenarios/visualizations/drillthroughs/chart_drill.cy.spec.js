import {
  signInAsAdmin,
  restore,
  withSampleDataset,
  openProductsTable,
  popover,
  sidebar,
} from "__support__/cypress";

describe("scenarios > visualizations > drillthroughs > chart drill", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should allow brush date filter", () => {
    withSampleDataset(({ ORDERS, PRODUCTS }) => {
      cy.request("POST", "/api/card", {
        name: "Orders by Product → Created At (month) and Product → Category",
        dataset_query: {
          database: 1,
          query: {
            "source-table": 2,
            aggregation: [["count"]],
            breakout: [
              [
                "datetime-field",
                [
                  "fk->",
                  ["field-id", ORDERS.PRODUCT_ID],
                  ["field-id", PRODUCTS.CREATED_AT],
                ],
                "month",
              ],
              [
                "fk->",
                ["field-id", ORDERS.PRODUCT_ID],
                ["field-id", PRODUCTS.CATEGORY],
              ],
            ],
          },
          type: "query",
        },
        display: "line",
        visualization_settings: {},
      }).then(response => {
        cy.visit(`/question/${response.body.id}`);

        // wait for chart to expand and display legend/labels
        cy.contains("Loading..."); // this gives more time to load
        cy.contains("Gadget");
        cy.contains("January, 2017");
        cy.wait(100); // wait longer to avoid grabbing the svg before a chart redraw

        // drag across to filter
        cy.get(".dc-chart svg")
          .trigger("mousedown", 100, 200)
          .trigger("mousemove", 200, 200)
          .trigger("mouseup", 200, 200);

        // new filter applied
        cy.contains("Created At between May, 2016 July, 2016");
        // more granular axis labels
        cy.contains("June, 2016");
        // confirm that product category is still broken out
        cy.contains("Gadget");
        cy.contains("Doohickey");
        cy.contains("Gizmo");
        cy.contains("Widget");
      });
    });
  });

  // this test was very flaky
  it.skip("should drill through a nested query", () => {
    // There's a slight hiccup in the UI with nested questions when we Summarize by City below.
    // Because there's only 5 rows, it automatically switches to the chart, but issues another
    // dataset request. So we wait for the dataset to load.
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    // save a question of people in CA
    cy.request("POST", "/api/card", {
      name: "CA People",
      display: "table",
      visualization_settings: {},
      dataset_query: {
        database: 1,
        query: { "source-table": 3, limit: 5 },
        type: "query",
      },
    });

    // build a new question off that grouping by City
    cy.visit("/question/new");
    cy.contains("Simple question").click();
    cy.contains("Saved Questions").click();
    cy.contains("CA People").click();
    cy.contains("Hudson Borer");
    cy.contains("Summarize").click();
    cy.contains("Summarize by")
      .parent()
      .parent()
      .contains("City")
      .click();

    // wait for chart to load
    cy.wait("@dataset");
    cy.contains("Count by City");
    // drill into the first bar
    cy.get(".bar")
      .first()
      .click({ force: true });
    cy.contains("View this CA Person").click();

    // check that filter is applied and person displayed
    cy.contains("City is Beaver Dams");
    cy.contains("Dominique Leffler");
  });

  it.skip("should drill through a with date filter (metabase#12496)", () => {
    // save a question of orders by week
    withSampleDataset(({ ORDERS }) => {
      cy.request("POST", "/api/card", {
        name: "Orders by Created At: Week",
        dataset_query: {
          database: 1,
          query: {
            "source-table": 2,
            aggregation: [["count"]],
            breakout: [["datetime-field", ORDERS.CREATED_AT, "week"]],
          },
          type: "query",
        },
        display: "line",
        visualization_settings: {},
      });
    });

    // Load the question up
    cy.visit("/collection/root");
    cy.contains("Orders by Created At: Week").click({ force: true });
    cy.contains("January, 2019");

    // drill into a recent week
    cy.get(".dot")
      .eq(-4)
      .click({ force: true });
    cy.contains("View these Orders").click();

    // check that filter is applied and rows displayed
    cy.contains("Showing 127 rows");

    cy.log("**Filter should show the range between two dates**");
    // Now click on the filter widget to see if the proper parameters got passed in
    cy.contains("Created At between").click();
  });

  it.skip("should drill-through on filtered aggregated results (metabase#13504)", () => {
    // go straight to "orders" in custom questions
    cy.visit("/question/new?database=1&table=2&mode=notebook");
    cy.findByText("Summarize").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("Created At").click();

    // add filter: Count > 1
    cy.findByText("Filter").click();
    popover().within(() => {
      cy.findByText("Count").click();
      cy.findByText("Equal to").click();
    });
    cy.findByText("Greater than").click();
    cy.findByPlaceholderText("Enter a number")
      .click()
      .type("1");
    cy.findByText("Add filter").click();

    // Visualize: line
    cy.findByText("Visualize").click();
    cy.findByText("Visualization").click();
    cy.get(".Icon-line").click();
    cy.findByText("Done").click();
    cy.log("**Mid-point assertion**");
    cy.contains("Count by Created At: Month");
    // at this point, filter is displaying correctly with the name
    cy.contains("Count is greater than 1");

    // drill-through
    cy.get(".dot")
      .eq(10) // random dot
      .click({ force: true });
    cy.findByText("View these Orders").click();

    cy.log("**Reproduced on 0.34.3, 0.35.4, 0.36.7 and 0.37.0-rc2**");
    // when the bug is present, filter is missing a name (showing only "is 256")
    cy.contains("Count is equal to 256");
    cy.findByText("There was a problem with your question").should("not.exist");
  });

  describe("for an unsaved question", () => {
    before(() => {
      restore();
      signInAsAdmin();
      // Build a question without saving
      openProductsTable();
      cy.findByText("Summarize").click();
      sidebar().within(() => {
        cy.contains("Category").click();
      });

      // Drill-through the last bar (Widget)
      cy.get(".bar")
        .last()
        .click({ force: true });
      cy.findByText("View these Products").click();
    });

    // [quarantine] flaky
    it.skip("should result in a correct query result", () => {
      cy.log("**Assert that the URL is correct**");
      cy.url().should("include", "/question#");

      cy.log("**Assert on the correct product category: Widget**");
      cy.findByText("Category is Widget");
      cy.findByText("Gizmo").should("not.exist");
      cy.findByText("Doohickey").should("not.exist");
    });
  });
});
