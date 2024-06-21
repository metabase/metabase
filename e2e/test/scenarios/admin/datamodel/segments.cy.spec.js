// Ported from `segments.e2e.spec.js`
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  modal,
  summarize,
  saveQuestion,
} from "e2e/support/helpers";
import { createSegment } from "e2e/support/helpers/e2e-table-metadata-helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > admin > datamodel > segments", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.viewport(1400, 860);
  });

  describe("with no segments", () => {
    it("should have 'Custom expression' in a filter list (metabase#13069)", () => {
      cy.visit("/admin/datamodel/segments");

      cy.log("should initially show no segments in UI");
      cy.get("main").findByText(
        "Create segments to add them to the Filter dropdown in the query builder",
      );

      cy.button("New segment").click();

      cy.findByTestId("gui-builder").findByText("Select a table").click();
      popover().findByText("Orders").click();

      cy.findByTestId("gui-builder")
        .findByText("Add filters to narrow your answer")
        .click();

      cy.log("Fails in v0.36.0 and v0.36.3. It exists in v0.35.4");
      popover().findByText("Custom Expression");
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
      createSegment({
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

    it("should see a newly asked question in its questions list", () => {
      cy.intercept("GET", "/api/table/*/query_metadata*").as("metadata");
      // Ask question
      cy.visit("/reference/segments/1/questions");
      cy.wait(["@metadata", "@metadata", "@metadata"]);

      cy.get("main").should("contain", `Questions about ${SEGMENT_NAME}`);
      cy.findByRole("status")
        .as("emptyStateMessage")
        .should(
          "have.text",
          "Questions about this segment will appear here as they're added",
        );

      cy.button("Ask a question").click();
      cy.findByTestId("filter-pill").should("have.text", "Orders < 100");
      cy.findAllByTestId("cell-data").should("contain", "37.65");

      summarize();
      cy.findAllByTestId("sidebar-right").button("Done").click();
      cy.findByTestId("scalar-value").should("have.text", "13,005");
      saveQuestion("Foo");

      // Check list
      cy.visit("/reference/segments/1/questions");
      cy.wait(["@metadata", "@metadata", "@metadata"]);

      cy.get("@emptyStateMessage").should("not.exist");
      cy.findByRole("heading", { name: "Foo" }).should("be.visible");
    });

    it("should update that segment", () => {
      cy.visit("/admin");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Table Metadata").click();
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
