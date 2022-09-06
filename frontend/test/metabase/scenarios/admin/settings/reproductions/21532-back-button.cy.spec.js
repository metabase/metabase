import { restore } from "__support__/e2e/helpers";

describe("issue 21532", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow navigating back from admin settings (metabase#21532)", () => {
    cy.visit("/");

    cy.icon("gear").click();
    cy.findByText("Admin settings").click();
    cy.findByText("Getting set up");

    cy.go("back");
    cy.location().should(location => {
      expect(location.pathname).to.eq("/");
    });
  });
});
