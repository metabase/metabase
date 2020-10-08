import {
  createNativeQuestion,
  restore,
  signInAsAdmin,
  openOrdersTable,
  openProductsTable,
  popover,
  modal,
  typeAndBlurUsingLabel,
} from "__support__/cypress";

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

  describe("joins", () => {
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

    it("should join on field literals", () => {
      // create two native questions
      createNativeQuestion("question a", "select 'foo' as a_column");
      createNativeQuestion("question b", "select 'foo' as b_column");

      // start a custom question with question a
      cy.visit("/question/new");
      cy.findByText("Custom question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("question a").click();

      // join to question b
      cy.get(".Icon-join_left_outer").click();
      popover().within(() => {
        cy.findByText("Sample Dataset").click();
        cy.findByText("Saved Questions").click();
        cy.findByText("question b").click();
      });

      // select the join columns
      popover().within(() => cy.findByText("A_COLUMN").click());
      popover().within(() => cy.findByText("B_COLUMN").click());

      cy.findByText("Visualize").click();
      cy.queryByText("Visualize").then($el => cy.wrap($el).should("not.exist")); // wait for that screen to disappear to avoid "multiple elements" errors

      // check that query worked
      cy.findByText("question a + question b");
      cy.findByText("A_COLUMN");
      cy.findByText("Question 5 → B Column");
      cy.findByText("Showing 1 row");
    });

    it("should allow joins based on saved questions (metabase#13000)", () => {
      cy.server();
      cy.route("POST", "/api/card/*/query").as("card");

      cy.log("**Prepare Question 1**");
      openOrdersTable();

      cy.findByText("Summarize").click();
      cy.findByText("Count").click();
      popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Total").click();
      });

      cy.findByText("Group by")
        .parent()
        .contains("Product ID")
        .click();

      // Mid-point check - generated title should be:
      cy.contains("Sum of Total by Product ID");

      cy.findByText("Done").click();
      cy.findByText("Save").click();
      // Save as Q1
      modal().within(() => {
        typeAndBlurUsingLabel("Name", "Q1");
        cy.findByText("Save").click();
      });
      modal().within(() => {
        cy.findByText("Not now").click();
      });

      cy.log("**Prepare Question 2**");
      openProductsTable();

      cy.findByText("Summarize").click();
      cy.findByText("Count").click();

      popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Rating").click();
      });

      cy.findByText("Group by")
        .parent()
        .contains("ID")
        .click();

      // Mid-point check - generated title should be:
      cy.contains("Sum of Rating by ID");

      cy.findByText("Done").click();
      cy.findByText("Save").click();
      // Save as Q2
      modal().within(() => {
        typeAndBlurUsingLabel("Name", "Q2");
        cy.findByText("Save").click();
      });
      modal().within(() => {
        cy.findByText("Not now").click();
      });

      cy.log("**Create Question 3 based on 2 previously saved questions**");

      cy.findByText("Ask a question").click();
      cy.findByText("Custom question").click();
      // Choose Q1
      popover().within(() => {
        cy.findByText("Saved Questions").click();
        cy.findByText("Q1").click();
      });
      // and join it
      cy.get(".Icon-join_left_outer").click();
      // with Q2
      popover().within(() => {
        cy.findByText("Sample Dataset").click();
        cy.findByText("Saved Questions").click();
        cy.findByText("Q2").click();
      });
      // on Product ID = ID
      popover()
        .contains("Product ID")
        .click();
      popover()
        .contains("ID")
        .click();
      // Save as Q3
      cy.findByText("Save").click();
      cy.get(".Modal").within(() => {
        typeAndBlurUsingLabel("Name", "Q3");
        cy.findByText("Save").click();
      });
      cy.findByText("Not now").click();

      cy.log("**Assert that the Q3 is in 'Our analytics'**");

      cy.visit("/");
      cy.findByText("Browse all items").click();

      cy.contains("Q3").click({ force: true });
      cy.wait("@card");

      cy.log("**The point where bug originated in v0.36.0**");
      cy.get(".Icon-notebook").click();
      cy.url().should("contain", "/notebook");
      cy.findByText("Visualize").should("exist");
    });
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

      cy.findByText("Not now").click();

      cy.get(".Icon-notebook").click();

      cy.reload();

      cy.findByText("Category").should("exist");
      cy.findByText("Category is Gadget").should("exist");
    });
  });
});
