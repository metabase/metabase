import { restore, signInAsAdmin, popover, modal } from "__support__/cypress";

describe("scenarios > admin > datamodel > segments", () => {
  before(restore);
  beforeEach(() => {
    signInAsAdmin();
    cy.viewport(1400, 860);
  });

  it("should create a segment", () => {
    cy.visit("/admin");
    cy.contains("Data Model").click();
    cy.contains("Segments").click();
    cy.contains("New segment").click();
    cy.contains("Select a table").click();
    popover()
      .contains("Orders")
      .click({ force: true }); // this shouldn't be needed, but there were issues with reordering as loads happeend

    cy.url().should("match", /segment\/create$/);
    cy.contains("Create Your Segment");

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
    cy.contains("12765 rows");

    // fill in name/description
    cy.get('[name="name"]').type("orders <100");
    cy.get('[name="description"]').type("All orders with a total under $100.");

    // saving bounces you back and you see new segment in the list
    cy.contains("Save changes").click();
    cy.url().should("match", /datamodel\/segments$/);
    cy.contains("orders <100");
    cy.contains("Filtered by Total");
  });

  it("should update that segment", () => {
    cy.visit("/admin");
    cy.contains("Data Model").click();
    cy.contains("Segments").click();

    cy.contains("orders <100")
      .parent()
      .parent()
      .find(".Icon-ellipsis")
      .click();
    cy.contains("Edit Segment").click();

    // update the filter from "< 100" to "> 10"
    cy.url().should("match", /segment\/1$/);
    cy.contains("Edit Your Segment");
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
    cy.contains("18703 rows");

    // update name and description, set a revision note, and save the update
    cy.get('[name="name"]')
      .clear()
      .type("orders >10");
    cy.get('[name="description"]')
      .clear()
      .type("All orders with a total over $10.");
    cy.get('[name="revision_message"]').type("time for a change");
    cy.contains("Save changes").click();

    // get redirected to previous page and see the new segment name
    cy.url().should("match", /datamodel\/segments$/);
    cy.contains("orders >10");

    // clean up
    cy.contains("orders >10")
      .parent()
      .parent()
      .find(".Icon-ellipsis")
      .click();
    cy.contains("Retire Segment").click();
    modal()
      .find("textarea")
      .type("delete it");
    modal()
      .contains("button", "Retire")
      .click();
  });
});
