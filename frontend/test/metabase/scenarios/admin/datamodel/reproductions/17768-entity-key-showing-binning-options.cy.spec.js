import { restore, openReviewsTable, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { REVIEWS } = SAMPLE_DATASET;

describe.skip("issue 17768", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${REVIEWS.ID}`, {
      semantic_type: "type/Category",
      has_field_values: "list",
    });

    // Sync "Sample Dataset" schema
    cy.request("POST", `/api/database/1/sync_schema`);
    /**
     * This is a bit fragile and may result in the false positive result, depending on the CI machine that runs tests.
     * However, 3s should be a plenty of time for the sync to finish.
     * Although the arbitrary waiting is considered a bad practice, we don't have any other way to determine when the sync is finished.
     */
    cy.wait(3000);

    cy.request("PUT", `/api/field/${REVIEWS.ID}`, {
      semantic_type: "type/PK",
      has_field_values: "none",
    });
  });

  it("should not show binning options for an entity key, regardless of its underlying type (metabase#17768)", () => {
    openReviewsTable({ mode: "notebook" });

    cy.findByText("Summarize").click();
    cy.findByText("Pick a column to group by").click();

    popover().within(() => {
      cy.findByText("ID")
        .closest(".List-section")
        .realHover()
        .contains("Auto bin")
        .should("not.exist");
    });
  });
});
