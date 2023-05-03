import { restore } from "e2e/support/helpers";

describe("issue 21532", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow navigating back from admin settings (metabase#21532)", () => {
    cy.visit("/");

    cy.icon("gear").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Admin settings").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Getting set up");

    cy.go("back");
    cy.location().should(location => {
      expect(location.pathname).to.eq("/");
    });
  });
});
