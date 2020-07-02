import { restore, signInAsAdmin, popover, modal } from "__support__/cypress";

describe("scenarios > admin > datamodel > metrics", () => {
  before(restore);
  beforeEach(() => {
    signInAsAdmin();
    cy.viewport(1400, 860);
  });

  it("should create a metric", () => {
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
