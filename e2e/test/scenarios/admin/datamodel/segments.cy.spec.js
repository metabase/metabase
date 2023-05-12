// Ported from `segments.e2e.spec.js`
import {
  restore,
  popover,
  modal,
  filter,
  filterField,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > segments", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(1400, 860);
  });

  describe("with no segments", () => {
    it("should show no segments in UI", () => {
      cy.visit("/admin/datamodel/segments");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Segments").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "Create segments to add them to the Filter dropdown in the query builder",
      );
    });

    it("should have 'Custom expression' in a filter list (metabase#13069)", () => {
      cy.visit("/admin/datamodel/segments");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New segment").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Select a table").click();

      // Ugly hack to prevent failures that started after https://github.com/metabase/metabase/pull/24682 has been merged.
      // For unknon reasons, popover doesn't open with expanded list of all Sample Database tables. Rather. it shows
      // Sample Database (collapsed) only. We need to click on it to expand it.
      // This conditional mechanism prevents failures even if that popover opens expanded in the future.
      cy.get(".List-section").then($list => {
        if ($list.length !== 5) {
          cy.findByText("Sample Database").click();
        }
        cy.findByText("Orders").click();
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Add filters to narrow your answer").click();

      cy.log("Fails in v0.36.0 and v0.36.3. It exists in v0.35.4");
      popover().within(() => {
        cy.findByText("Custom Expression");
      });
    });

    it("should show no segments", () => {
      cy.visit("/reference/segments");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Segments are interesting subsets of tables");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(SEGMENT_NAME);

      // Detail view
      cy.visit("/reference/segments/1");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Description");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("See this segment");

      // Segment fields
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Fields in this segment").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("See this segment").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`Fields in ${SEGMENT_NAME}`);
      cy.findAllByText("Discount");
    });

    it("should show up in UI list", () => {
      cy.visit("/admin/datamodel/segments");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(SEGMENT_NAME);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Filtered by Total");
    });

    it("should show the segment details of a specific id", () => {
      cy.visit("/admin/datamodel/segment/1");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Edit Your Segment");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Preview");
    });

    it("should show no questions based on a new segment", () => {
      cy.visit("/reference/segments/1/questions");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(`Questions about ${SEGMENT_NAME}`);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "Questions about this segment will appear here as they're added",
      );
    });

    it("should see a newly asked question in its questions list", () => {
      // Ask question
      cy.visit("/reference/segments/1/questions");
      cy.get(".full .Button").click();
      cy.findAllByText("37.65");

      filter();
      filterField("Product ID", {
        value: "14",
      });
      cy.findByTestId("apply-filters").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Product ID is 14");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();
      cy.findAllByText("Save").last().click();

      // Check list
      cy.visit("/reference/segments/1/questions");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        "Questions about this segment will appear here as they're added",
      ).should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(
        `Orders, Filtered by ${SEGMENT_NAME} and Product ID equals 14`,
      );
    });

    it("should update that segment", () => {
      cy.visit("/admin");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Data Model").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Segments").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(SEGMENT_NAME)
        .parent()
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Edit Segment").click();

      // update the filter from "< 100" to "> 10"
      cy.url().should("match", /segment\/1$/);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Edit Your Segment");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(/Total\s+is less than/).click();
      popover().contains("Less than").click();
      popover().contains("Greater than").click();
      popover().find("input").type("{SelectAll}10");
      popover().contains("Update filter").click();

      // confirm that the preview updated
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("18758 rows");

      // update name and description, set a revision note, and save the update
      cy.get('[name="name"]').clear().type("Orders > 10");
      cy.get('[name="description"]')
        .clear()
        .type("All orders with a total over $10.");
      cy.get('[name="revision_message"]').type("time for a change");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Save changes").click();

      // get redirected to previous page and see the new segment name
      cy.url().should("match", /datamodel\/segments$/);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Orders > 10");

      // clean up
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Orders > 10")
        .parent()
        .parent()
        .parent()
        .find(".Icon-ellipsis")
        .click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Retire Segment").click();
      modal().find("textarea").type("delete it");
      modal().contains("button", "Retire").click();
    });
  });
});
