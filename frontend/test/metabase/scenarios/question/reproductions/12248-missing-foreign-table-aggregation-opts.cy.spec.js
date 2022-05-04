import {
  restore,
  openReviewsTable,
  popover,
  visualize,
} from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, REVIEWS } = SAMPLE_DATABASE;

describe("issue 12248", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", `/api/field/${REVIEWS.RATING}`, {
      visibility_type: "sensitive",
    });
    cy.request("PUT", `/api/field/${REVIEWS.PRODUCT_ID}`, {
      semantic_type: "type/FK",
      fk_target_field_id: PRODUCTS.ID,
    });
  });

  it("should use foreign tables when offering aggregation operators in notebook (metabase#12248)", () => {
    openReviewsTable({ mode: "notebook" });
    cy.findByText("Summarize").click();
    popover().within(() => {
      cy.findAllByText(/Count of rows/i);
      cy.findAllByText(/Sum/i);
      cy.findByText(/Distinct/i);
      cy.findByText(/Minimum/i);
      cy.findByText(/Maximum/i);
      cy.findByText(/Average/i).click();
    });
    popover().within(() => {
      cy.findByText("Product");
      cy.findByText("Review").should("not.exist");
      cy.findByText("Price").click();
    });
    visualize();
    cy.findByText("56.41");
  });
});
