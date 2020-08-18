import { restore, signInAsAdmin, popover, modal } from "__support__/cypress";

describe("scenarios > admin > datamodel > metrics", () => {
  before(restore);
  beforeEach(() => {
    signInAsAdmin();
    cy.viewport(1400, 860);
  });

  describe("with no metrics", () => {
    it("should show no metrics in the list", () => {
      cy.visit("/admin/datamodel/metrics");
      cy.findByText(
        "Create metrics to add them to the Summarize dropdown in the query builder",
      );
    });

    it("should show how to create metrics", () => {
      cy.visit("/reference/metrics");
      cy.findByText(
        "Metrics are the official numbers that your team cares about",
      );
      cy.findByText("Learn how to create metrics");
    });
  });

  describe("with metrics", () => {
    before(() => {
      // CREATE METRIC
      signInAsAdmin();
      cy.visit("/admin");
      cy.contains("Data Model").click();
      cy.contains("Metrics").click();
      cy.contains("New metric").click();
      cy.contains("Select a table").click();
      popover()
        .contains("Orders")
        .click({ force: true }); // this shouldn't be needed, but there were issues with reordering as loads happeend

      cy.url().should("match", /metric\/create$/);
      cy.contains("Create Your Metric");

      // filter to orders with total under 100
      cy.contains("Add filters").click();
      cy.contains("Total").click();
      cy.contains("Equal to").click();
      cy.contains("Less than").click();
      cy.get('[placeholder="Enter a number"]').type("100");
      popover()
        .contains("Add filter")
        .click();

      //
      cy.contains("Result: 12765");

      // fill in name/description
      cy.get('[name="name"]').type("orders <100");
      cy.get('[name="description"]').type(
        "Count of orders with a total under $100.",
      );

      // saving bounces you back and you see new metric in the list
      cy.contains("Save changes").click();
      cy.url().should("match", /datamodel\/metrics$/);
      cy.contains("orders <100");
      cy.contains("Count, Filtered by Total");
    });

    it("should show no questions based on a new metric", () => {
      cy.visit("/reference/metrics/1/questions");
      cy.findAllByText("Questions about orders <100");
      cy.findByText("Loading...");
      cy.findByText("Loading...").should("not.exist");
      cy.findByText(
        "Questions about this metric will appear here as they're added",
      );
    });

    it("should see a newly asked question in its questions list", () => {
      // Ask a new qustion
      cy.visit("/reference/metrics/1/questions");
      cy.get(".full")
        .find(".Button")
        .click();
      cy.findByText("Filter").click();
      cy.findByText("Total").click();
      cy.findByText("Equal to").click();
      cy.findByText("Greater than").click();
      cy.findByPlaceholderText("Enter a number").type("50");
      cy.findByText("Add filter").click();
      cy.findByText("Save").click();
      cy.findAllByText("Save")
        .last()
        .click();
      cy.findByText("Not now").click();

      // Check the list
      cy.visit("/reference/metrics/1/questions");
      cy.findByText("Our analysis").should("not.exist");
      cy.findAllByText("Questions about orders <100");
      cy.findByText("Orders, orders <100, Filtered by Total");
    });

    it("should show the metric detail view for a specific id", () => {
      cy.visit("/admin/datamodel/metric/1");
      cy.findByText("Edit Your Metric");
      cy.findByText("Preview");
    });

    it("should update that metric", () => {
      cy.visit("/admin");
      cy.contains("Data Model").click();
      cy.contains("Metrics").click();

      cy.contains("orders <100")
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      cy.contains("Edit Metric").click();

      // update the filter from "< 100" to "> 10"
      cy.url().should("match", /metric\/1$/);
      cy.contains("Edit Your Metric");
      cy.contains(/Total\s+is less than/).click();
      popover()
        .contains("Less than")
        .click();
      popover()
        .contains("Greater than")
        .click();
      popover()
        .find("input")
        .type("{SelectAll}10");
      popover()
        .contains("Update filter")
        .click();

      // confirm that the preview updated
      cy.contains("Result: 18703");

      // update name and description, set a revision note, and save the update
      cy.get('[name="name"]')
        .clear()
        .type("orders >10");
      cy.get('[name="description"]')
        .clear()
        .type("Count of orders with a total over $10.");
      cy.get('[name="revision_message"]').type("time for a change");
      cy.contains("Save changes").click();

      // get redirected to previous page and see the new metric name
      cy.url().should("match", /datamodel\/metrics$/);
      cy.contains("orders >10");

      // clean up
      cy.contains("orders >10")
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      cy.contains("Retire Metric").click();
      modal()
        .find("textarea")
        .type("delete it");
      modal()
        .contains("button", "Retire")
        .click();
    });
  });
});
