import { restore, describeEE, visitQuestion } from "__support__/e2e/helpers";

describeEE("issue 18021", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("POST", "/api/moderation-review", {
      status: "verified",
      moderated_item_id: 1,
      moderated_item_type: "card",
    });

    visitQuestion(1);

    cy.findByTestId("qb-header-left-side").find(".Icon-verified");
  });

  it("should show verified badge in the 'Recently viewed' list (metabase#18021)", () => {
    cy.findByPlaceholderText("Search…").click();

    cy.findByText("Recently viewed")
      .parent()
      .within(() => {
        cy.findByText("Orders")
          .closest("a")
          .find(".Icon-verified");
      });
  });
});
