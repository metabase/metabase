import { restore } from "__support__/e2e/cypress";

describe.skip("issue 18021", () => {
  beforeEach(() => {
    // Run the test only for EE version
    cy.onlyOn(!!Cypress.env("HAS_ENTERPRISE_TOKEN"));

    restore();
    cy.signInAsAdmin();

    cy.request("POST", "/api/moderation-review", {
      status: "verified",
      moderated_item_id: 1,
      moderated_item_type: "card",
    });

    cy.visit("/question/1");

    cy.findByTestId("saved-question-header-button").find(".Icon-verified");
  });

  it("should show verified badge in the 'Recently viewed' list (metabase#18021)", () => {
    cy.findByPlaceholderText("Search…").click();

    cy.findByText("Recently viewed")
      .parent()
      .within(() => {
        cy.findByText("Orders").closest("a").find(".Icon-verified");
      });
  });
});
