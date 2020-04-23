import { signInAsAdmin, restore } from "__support__/cypress";

describe("scenarios > visualizations > chart drill", () => {
  before(restore);
  beforeEach(signInAsAdmin);

  it("should allow brush date filter", () => {
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
              ["fk->", ["field-id", 11], ["field-id", 7]],
              "month",
            ],
            ["fk->", ["field-id", 11], ["field-id", 6]],
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

  it("should drill through a nested query", () => {
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

    // drill into the first bar
    cy.get(".bar")
      .first()
      .click({ force: true });
    cy.contains("View this CA Person").click();

    // check that filter is applied and person displayed
    cy.contains("City is Beaver Dams");
    cy.contains("Dominique Leffler");
  });
});
