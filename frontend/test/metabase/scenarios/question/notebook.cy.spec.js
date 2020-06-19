import { restore, signInAsAdmin, popover, modal } from "__support__/cypress";

describe("scenarios > question > notebook", () => {
  before(restore);
  beforeEach(signInAsAdmin);

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
    cy.get(".Icon-filter").click();
    popover().within(() => {
      cy.get(".Icon-int").click();
      cy.get("input").type("46");
      cy.contains("Add filter").click();
    });
    cy.contains("Visualize").click();
    cy.contains("2372"); // user's id in the table
    cy.contains("Showing 1 row"); // ensure only one user was returned
  });

  it("should allow joins", () => {
    // start a custom question with orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Orders").click();

    // join to Reviews on orders.product_id = reviews.product_id
    cy.get(".Icon-join_left_outer").click();
    popover()
      .contains("Reviews")
      .click();
    popover()
      .contains("Product ID")
      .click();
    popover()
      .contains("Product ID")
      .click();

    // get the average rating across all rows (not a useful metric)
    cy.contains("Pick the metric you want to see").click();
    popover()
      .contains("Average of")
      .click();
    popover()
      .find(".Icon-join_left_outer")
      .click();
    popover()
      .contains("Rating")
      .click();
    cy.contains("Visualize").click();
    cy.contains("Orders + Reviews");
    cy.contains("3");
  });

  it("should allow post-join filters (metabase#12221)", () => {
    cy.log("start a custom question with Orders");
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Orders").click();

    cy.log("join to People table using default settings");
    cy.get(".Icon-join_left_outer ").click();
    cy.contains("People").click();
    cy.contains("Orders + People");
    cy.contains("Visualize").click();
    cy.contains("Showing first 2,000");

    cy.log("attempt to filter on the joined table");
    cy.contains("Filter").click();
    cy.contains("Email").click();
    cy.contains("People – Email");
    cy.get('[placeholder="Search by Email"]').type("wolf.");
    cy.contains("wolf.dina@yahoo.com").click();
    cy.contains("Add filter").click();
    cy.contains("Showing 1 row");
  });

  describe("nested", () => {
    it("should create a nested question with post-aggregation filter", () => {
      // start a custom question with orders
      cy.visit("/question/new?database=1&table=1&mode=notebook");

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

      cy.findByText("Visualize").click();
      cy.findByText("Gadget").should("exist");
      cy.findByText("Gizmo").should("not.exist");

      cy.findByText("Save").click();

      modal().within(() => {
        cy.findByLabelText("Name").type("post aggregation");
        cy.findByText("Save").click();
      });

      modal().within(() => {
        cy.findByText("Not now").click();
      });

      cy.get(".Icon-notebook").click();

      cy.reload();

      cy.findByText("Category").should("exist");
      cy.findByText("Category is Gadget").should("exist");
    });
  });
});
