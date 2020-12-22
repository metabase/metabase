import {
  restore,
  signInAsNormalUser,
  sidebar,
  popover,
} from "__support__/cypress";

describe("smoketest > user", () => {
  // Goal: user can use all the features of the simple question and notebook editor
  before(restore);
  beforeEach(signInAsNormalUser);

  it("should be able to ask a custom questions", () => {
    cy.visit("/");
    cy.findByText("Ask a question").click();
    cy.findByText("Custom question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Products").click();
    cy.findByText("Add filters to narrow your answer").click();
    cy.findByText("Vendor").click();
    cy.findByText("Is").click();
    cy.findByText("Not empty").click();
    cy.findByText("Add filter").click();
    cy.findByText("Pick the metric you want to see").click();
    cy.findByText("Average of ...").click();
    cy.findByText("Rating").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("Title").click();

    cy.findByText("Average of Rating");

    cy.findByText("Visualize").click();

    cy.get(".Icon-bar");
    cy.findAllByText("Vendor is not empty");
    cy.get("svg");
    cy.findByText("Visualization");
  });

  it("should sort via both the header and notebook editor", () => {
    // Sorting by header
    cy.wait(1000)
      .get(".Icon-table2")
      .click();
    cy.get(".cellData")
      .eq(2)
      .as("firstTableCell");

    cy.get("@firstTableCell").contains("Aerodynamic Bronze Hat");

    cy.get(".cellData")
      .contains("Average of Rating")
      .click();

    cy.get(".Icon-arrow_down").click();

    cy.get("@firstTableCell").contains("Ergonomic Wool Bag");

    // Sorting by notebook editor
    cy.get(".Icon-notebook").click();

    cy.findByText("Sort")
      .next() // not ideal, but at least we're making sure 'x' is related to 'Sort'
      .within(() => {
        cy.get(".Icon-close") // Remove previously applied sorting
          .click();
      });

    // Add new sort (by Title)
    cy.findByText("Sort").click();

    popover().within(() => {
      cy.findAllByText("Title").click();
    });
    cy.findByText("Visualize").click();

    cy.get("@firstTableCell").contains("Aerodynamic Bronze Hat");

    cy.get(".Icon-table2").click();
  });

  it("should filter via the sidebar, header, and notebook editor", () => {
    // Sidebar filter

    cy.wait(1000)
      .findByText("Visualize")
      .should("not.exist");
    cy.findAllByText("Filter")
      .first()
      .click();
    cy.findByText("Category").click();
    cy.findByText("Is");
    cy.findByText("Gadget").click();
    cy.findByText("Add filter").click();

    cy.findByText("Vendor is not empty");

    // Can delete filter in header

    cy.findByText("Category is Gadget").click(140, 10);
    cy.findByText("Category is Gadget").should("not.exist");

    // Notebook editor filter

    cy.get(".Icon-notebook").click();
    cy.wait(1000)
      .get(".Icon-filter")
      .click();
    cy.get(".Icon-int").click();
    cy.findByText("Equal to").click();
    cy.findByText("Greater than or equal to").click();
    cy.get("input[placeholder='Enter a number']").type("5");
    cy.findByText("Add filter").click();
    cy.findByText("Visualize").click();

    cy.findByText("Visualize").should("not.exist");
    cy.get("svg");
    cy.findByText("Average of Rating is greater than or equal to 5");

    // Can delete filter in header again

    cy.findByText("Average of Rating is greater than or equal to 5").click(
      300,
      10,
    );
    cy.findByText("Average of Rating is greater than or equal to 5").should(
      "not.exist",
    );

    // Header filter

    cy.get(".TableInteractive-cellWrapper--lastColumn")
      .eq(1)
      .contains("0");

    cy.findAllByText("Average of Rating").click();
    cy.findByText("Filter by this column").click();
    cy.findByText("Equal to").click();
    cy.findByText("Greater than or equal to").click();
    cy.get("input[placeholder='Enter a number']").type("4");
    cy.findByText("Update filter").click();

    cy.get(".TableInteractive-cellWrapper--lastColumn")
      .eq(1)
      .contains("4.2");

    // Can minimize Filter dispay in header

    cy.get(".Icon-filter")
      .first()
      .click();

    cy.findByText("Vendor is not empty").should("not.exist");
  });

  it("should summarize via both the sidebar and notebook editor", () => {
    // Sidebar summary

    cy.findAllByText("Summarize")
      .first()
      .click();
    cy.findByText("Category").click();
    cy.findByText("Done").click();

    // Delete summary from sidebar

    cy.findAllByText("Summarize")
      .first()
      .click();
    cy.get(".Icon-close")
      .first()
      .click();
    cy.findByText("Done").click();

    cy.findByText("Average of Rating by Category").should("not.exist");
    cy.get("span")
      .findByText("Group")
      .should("not.exist");

    // Notebook editor summary

    cy.get(".Icon-notebook").click();

    cy.get(".Icon-sum").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.get(".Icon-calendar").click();
    cy.findByText("Visualize").click();

    cy.get("svg");
    cy.findAllByText("Created At");
  });

  /**
   * NOTE: - There is a HIGH chance that there are still references to the old "drill-through"/actions popover
   *         among the skipped tests. Because of the urgency to fix smoke tests (2020-11-26) there is not enough
   *         time to fully commit to cleaning skipped tests as well.
   *
   *       - In general, all smoke tests need serious refactoring
   *
   * TODO: - Once that work starts, make sure to update obsolete references in popover!
   */

  it.skip("should be able to create custom columns in the notebook editor", () => {
    cy.get(".Icon-notebook").click();

    // Delete last summary
    cy.findAllByText("Count")
      .first()
      .click(70, 20);

    // Switch table from Product to Orders

    cy.findAllByText("Products")
      .last()
      .click();
    cy.findByText("Orders").click();

    // Create custom column
    cy.get(".Icon-add_data").click();
    cy.findByText("Product → Price").click();
    cy.findByText("-").click();
    cy.findByText("Subtotal").click();
    cy.get(".PopoverBody")
      .first()
      .click();
    cy.get("input[placeholder='Something nice and descriptive']").type(
      "Demo Column",
    );
    cy.findByText("Done").click();
    cy.findByText("Visualize").click();

    cy.findByText("ID");
    cy.get(".Icon-table2");
    cy.wait(1000).findByText("Demo Column");
    cy.findByText("Products").should("not.exist");
  });

  it.skip("should be able to use all notebook editor functions", () => {
    // Custom JOINs

    cy.get(".Icon-notebook").click();

    cy.get(".Icon-join_left_outer").click();
    cy.findByText("People").click(); // column selection happens automatcially
    cy.findByText("Visualize").click();

    cy.findByText("User → ID");
    cy.findByText("Created At");
    cy.findByText("Orders + People");

    // Setting Row limit

    cy.get(".Icon-notebook").click();

    cy.findByText("Row limit").click();
    cy.get("input[type='number']").type("10");
    cy.findByText("Visualize").click();

    cy.get(".TableInteractive-cellWrapper--firstColumn").should(
      "have.length",
      11,
    );

    // Can view the SQL query

    cy.get(".Icon-notebook", { timeout: 20000 }).click();
    cy.get(".Icon-sql")
      .last()
      .click();

    cy.contains('SELECT "source"."ID"');
    cy.get(".Icon-close")
      .last()
      .click();
  });

  it.skip("should be able to do header actions", () => {
    // Reset question

    cy.findAllByText("Orders")
      .first()
      .click();
    cy.findByText("Products").click();

    // Distinctions
    // *** This test needs to be improved with variables that will change if the Sample data changes

    cy.findByText("Visualize").click();

    cy.findByText("Category").click();
    cy.findByText("Distincts").click();
    cy.findByText("4");
    cy.findByText("3").should("not.exist");

    cy.get(".Icon-close")
      .last()
      .click();

    // Distributing

    cy.findByText("Rating").click();
    cy.findByText("Distribution").click();
    cy.get(".Icon-table2").click();

    cy.findByText("Count");
    cy.findByText("Created At").should("not.exist");
    cy.get(".cellData").should("have.length", 14);

    // Formatting

    // Refresh works

    cy.get(".Icon-refresh")
      .first()
      .click();
    // *** check that refresh has happened
    cy.findByText("Sample Dataset");
  });

  it.skip("should ensuring that header actions are appropriate for different data types", () => {
    // *** Currently Longitude is an integer while zip codes and dates are strings in terms of header options
    cy.findAllByText("Summarize")
      .first()
      .click();
    sidebar()
      .find(".Icon-close")
      .first()
      .click();
    cy.findByText("Done").click();

    // ID column

    cy.findByText("ID").click();

    cy.get(".Icon-arrow_up");
    cy.get(".Icon-arrow_down");
    cy.findByText("Distincts");
    cy.findByText("Distribution").should("not.exist");
    cy.get(".Icon-filter");
    cy.findByText("Formatting");

    // String column

    cy.findAllByText("Title")
      .last()
      .click();

    cy.get(".Icon-arrow_up");
    cy.get(".Icon-arrow_down");
    cy.findByText("Distincts");
    cy.findByText("Distribution");
    cy.get(".Icon-filter");
    cy.findByText("Formatting");
    cy.get(".PopoverBody")
      .findByText("Sum")
      .should("not.exist");

    // Integer column

    cy.findAllByText("Price")
      .last()
      .click();

    cy.get(".Icon-arrow_up");
    cy.get(".Icon-arrow_down");
    cy.findByText("Sum");
    cy.findByText("Min");
    cy.findByText("Max");
    cy.findByText("Distincts");
    cy.findByText("Sum over time");
    cy.findByText("Distribution");
    cy.get(".Icon-filter");
    cy.findByText("Formatting");

    // Longitude column (first switch to people table)

    cy.get(".Icon-notebook").click();
    cy.findAllByText("Products")
      .last()
      .click();
    cy.findByText("People").click();
    cy.findByText("Visualize").click();

    cy.findByText("Longitude").click();

    cy.get(".Icon-arrow_up");
    cy.get(".Icon-arrow_down");
    cy.findByText("Sum");
    cy.findByText("Min");
    cy.findByText("Max");
    cy.findByText("Distincts");
    cy.findByText("Sum over time");
    cy.findByText("Distribution");
    cy.get(".Icon-filter");
    cy.findByText("Formatting");

    // Boolean column contians appropriate options
    // *** The sample data does not contain any boolean columns
  });
});
