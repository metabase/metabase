import { restore, signInAsAdmin } from "__support__/cypress";

describe("scenarios > admin > datamodel > segments", () => {
  before(restore);
  beforeEach(() => {
    signInAsAdmin();
    cy.viewport(1400, 860);
  });

  it("should create a segment", () => {
    cy.visit("/admin");
    cy.contains("Data Model").click();
    cy.contains("Orders").click();

    // empty state displays message
    cy.contains(
      "Create segments to add them to the Filter dropdown in the query builder",
    );

    // redirected to segment form
    cy.contains("Add a Segment").click();
    cy.url().should("match", /segment\/create\?table=2$/);
    cy.contains("Create Your Segment");

    // filter to orders with total under 100
    cy.contains("Add filters").click();
    cy.contains("Total").click();
    cy.contains("Equal to").click();
    cy.contains("Less than").click();
    cy.get('[placeholder="Enter a number"]').type("100");
    cy.get(".PopoverBody")
      .contains("Add filter")
      .click();

    //
    cy.contains("12765 rows");

    // fill in name/description
    cy.get('[name="name"]').type("orders <100");
    cy.get('[name="description"]').type("All orders with a total under $100.");

    // saving bounces you back and you see new segment in the list
    cy.contains("Save changes").click();
    cy.url().should("match", /datamodel\/database\/1\/table\/2$/);
    cy.contains("orders <100");
    cy.contains("Filtered by Total");
  });

  it("should update that segment", () => {
    // visit table's data model page and click to edit the segment
    cy.visit("/admin/datamodel/database/1/table/2");
    cy.contains("orders <100")
      .parent()
      .find(".Icon-ellipsis")
      .click();
    cy.contains("Edit Segment").click();

    // update the filter from "< 100" to "> 10"
    cy.url().should("match", /segment\/1$/);
    cy.contains("Edit Your Segment");
    cy.contains(/Total\s+is less than/).click();
    cy.get(".PopoverBody")
      .contains("Less than")
      .click();
    cy.get(".PopoverBody")
      .contains("Greater than")
      .click();
    cy.get(".PopoverBody input").type("{SelectAll}10");
    cy.get(".PopoverBody")
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
    cy.url().should("match", /datamodel\/database\/1\/table\/2$/);
    cy.contains("orders >10");

    // clean up
    cy.contains("orders >10")
      .parent()
      .find(".Icon-ellipsis")
      .click();
    cy.contains("Retire Segment").click();
    cy.get(".ModalBody textarea").type("delete it");
    cy.get(".ModalBody")
      .contains("button", "Retire")
      .click();
  });
});
