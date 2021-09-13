import { restore, openReviewsTable, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { REVIEWS } = SAMPLE_DATASET;

describe("issue 17768", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${REVIEWS.ID}`, {
      semantic_type: "type/Category",
      has_field_values: "list",
    });

    // Sync "Sample Dataset" schema
    cy.request("POST", `/api/database/1/sync_schema`);

    waitForSyncToFinish();

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

function waitForSyncToFinish(iteration = 0) {
  // 100 x 100ms should be plenty of time for the sync to finish.
  // If it doesn't, we have a much bigger problem than this issue.
  if (iteration === 100) {
    return;
  }

  cy.request("GET", `/api/field/${REVIEWS.ID}`).then(
    ({ body: { fingerprint } }) => {
      if (fingerprint === null) {
        cy.wait(100);

        waitForSyncToFinish(++iteration);
      }

      return;
    },
  );
}
