import { restore } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { REVIEWS_ID } = SAMPLE_DATASET;

describe.skip("issue 16785", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/table", {
      ids: [REVIEWS_ID],
      visibility_type: "hidden",
    });
  });

  it("should not display hidden tables (metabase#16785)", () => {
    cy.visit("/");
    cy.findByPlaceholderText("Search…").type("Reviews");

    cy.findByTestId("search-results-list").within(() => {
      cy.findByText("Reviews").should("not.exist");
    });
  });
});
