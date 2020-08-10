import {
  restore,
  signInAsAdmin,
  popover,
  modal,
  sidebar,
} from "__support__/cypress";
// Ported from `segments.e2e.spec.js`

describe("scenarios > admin > datamodel > segments", () => {
  before(restore);
  beforeEach(() => {
    signInAsAdmin();
    cy.viewport(1400, 860);
  });

  describe("with no segments", () => {
    it("should show no segments in UI", () => {
      cy.visit("/admin/datamodel/segments");
      cy.findByText("Segments").click();
      cy.findByText(
        "Create segments to add them to the Filter dropdown in the query builder",
      );
    });

    it("should show no segments", () => {
      cy.visit("/reference/segments");
      cy.findByText("Segments are interesting subsets of tables");
      cy.findByText("Learn how to create segments");
    });
  });

  describe("with segment", () => {
    before(() => {
      // CREATES A SEGMENT
      signInAsAdmin();
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

      cy.contains("12765 rows");

      // fill in name/description
      cy.get('[name="name"]').type("orders <100");
      cy.get('[name="description"]').type(
        "All orders with a total under $100.",
      );

      // saving bounces you back and you see new segment in the list
      cy.contains("Save changes").click();
      cy.url().should("match", /datamodel\/segments$/);
    });

    it("should show the segment fields list and detail view", () => {
      // In the list
      cy.visit("/reference/segments");
      cy.findByText("orders <100");

      // Detail view
      cy.visit("/reference/segments/1");
      cy.findByText("Description");
      cy.findByText("See this segment");

      // Segment fields
      cy.findByText("Fields in this segment").click();
      cy.findByText("See this segment").should("not.exist");
      cy.findByText("Fields in orders <100");
      cy.findAllByText("Discount");
    });

    it("should show up in UI list", () => {
      cy.visit("/admin/datamodel/segments");
      cy.contains("orders <100");
      cy.contains("Filtered by Total");
    });

    it("should show the segment details of a specific id", () => {
      cy.visit("/admin/datamodel/segment/1");
      cy.findByText("Edit Your Segment");
      cy.findByText("Preview");
    });

    it("should show no questions based on a new segment", () => {
      cy.visit("/reference/segments/1/questions");
      cy.findByText("Questions about orders <100");
      cy.findByText(
        "Questions about this segment will appear here as they're added",
      );
    });

    it("should see a newly asked question in its questions list", () => {
      // Ask question
      cy.visit("/reference/segments/1/questions");
      cy.get(".full .Button").click();
      cy.findAllByText("Filter")
        .first()
        .click();
      sidebar().within(() => {
        cy.contains("Product ID").click();
      });
      cy.findByPlaceholderText("Enter an ID").type("14");
      cy.findByText("Add filter").click();
      cy.findByText("Product ID is 14");
      cy.findByText("Save").click();
      cy.findAllByText("Save")
        .last()
        .click();

      // Check list
      cy.visit("/reference/segments/1/questions");
      cy.findByText(
        "Questions about this segment will appear here as they're added",
      ).should("not.exist");
      cy.findByText("Orders, Filtered by orders <100 and Product");
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
});
