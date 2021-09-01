// Ported from `segments.e2e.spec.js`
import { restore, popover, modal } from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

describe("scenarios > admin > datamodel > segments", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
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

    it.skip("should have 'Custom expression' in a filter list (metabase#13069)", () => {
      cy.visit("/admin/datamodel/segments");
      cy.findByText("New segment").click();
      cy.findByText("Select a table").click();
      popover().within(() => {
        cy.findByText("Orders").click();
      });
      cy.findByText("Add filters to narrow your answer").click();

      cy.log("Fails in v0.36.0 and v0.36.3. It exists in v0.35.4");
      popover().within(() => {
        cy.findByText("Custom Expression");
      });
    });

    it("should show no segments", () => {
      cy.visit("/reference/segments");
      cy.findByText("Segments are interesting subsets of tables");
      cy.findByText("Learn how to create segments");
    });
  });

  describe("with segment", () => {
    const SEGMENT_NAME = "Orders < 100";

    beforeEach(() => {
      // Create a segment through API
      cy.request("POST", "/api/segment", {
        name: SEGMENT_NAME,
        description: "All orders with a total under $100.",
        table_id: ORDERS_ID,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });
    });

    it("should show the segment fields list and detail view", () => {
      // In the list
      cy.visit("/reference/segments");
      cy.findByText(SEGMENT_NAME);

      // Detail view
      cy.visit("/reference/segments/1");
      cy.findByText("Description");
      cy.findByText("See this segment");

      // Segment fields
      cy.findByText("Fields in this segment").click();
      cy.findByText("See this segment").should("not.exist");
      cy.findByText(`Fields in ${SEGMENT_NAME}`);
      cy.findAllByText("Discount");
    });

    it("should show up in UI list", () => {
      cy.visit("/admin/datamodel/segments");
      cy.contains(SEGMENT_NAME);
      cy.contains("Filtered by Total");
    });

    it("should show the segment details of a specific id", () => {
      cy.visit("/admin/datamodel/segment/1");
      cy.findByText("Edit Your Segment");
      cy.findByText("Preview");
    });

    it("should show no questions based on a new segment", () => {
      cy.visit("/reference/segments/1/questions");
      cy.findByText(`Questions about ${SEGMENT_NAME}`);
      cy.findByText(
        "Questions about this segment will appear here as they're added",
      );
    });

    it("should see a newly asked question in its questions list", () => {
      // Ask question
      cy.visit("/reference/segments/1/questions");
      cy.get(".full .Button").click();
      cy.findAllByText("37.65");
      cy.findAllByText("Filter")
        .first()
        .click();
      cy.findByTestId("sidebar-right").within(() => {
        cy.contains("Product ID").click();
      });
      cy.findByText("Cancel");
      cy.findByPlaceholderText("Enter an ID")
        .click()
        .type("14", { delay: 100 });
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
      cy.findByText(`Orders, Filtered by ${SEGMENT_NAME} and Product`);
    });

    it("should update that segment", () => {
      cy.visit("/admin");
      cy.contains("Data Model").click();
      cy.contains("Segments").click();

      cy.contains(SEGMENT_NAME)
        .parent()
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
      cy.contains("18758 rows");

      // update name and description, set a revision note, and save the update
      cy.get('[name="name"]')
        .clear()
        .type("Orders > 10");
      cy.get('[name="description"]')
        .clear()
        .type("All orders with a total over $10.");
      cy.get('[name="revision_message"]').type("time for a change");
      cy.contains("Save changes").click();

      // get redirected to previous page and see the new segment name
      cy.url().should("match", /datamodel\/segments$/);
      cy.contains("Orders > 10");

      // clean up
      cy.contains("Orders > 10")
        .parent()
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
