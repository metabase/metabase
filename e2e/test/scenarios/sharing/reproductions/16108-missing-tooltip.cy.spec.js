import { restore, visitQuestion } from "e2e/support/helpers";

describe("issue 16108", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display a tooltip for CTA icons on an individual question (metabase#16108)", () => {
    visitQuestion(1);
    cy.icon("download").realHover();
    cy.findByText("Download full results");
    cy.icon("bell").realHover();
    cy.findByText("Get alerts");
    cy.icon("share").realHover();
    cy.findByText("Sharing");
  });
});
