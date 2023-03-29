import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { REVIEWS_ID } = SAMPLE_DATABASE;

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
