import { restore } from "__support__/e2e/cypress";

describe("visual tests > internal > components", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("UserAvatar", () => {
    cy.visit("/_internal");

    cy.findByText("UserAvatar").click();

    cy.percySnapshot();
  });

  it("ClampedText", () => {
    cy.visit("/_internal/components/clampedtext");

    cy.wait(5000).findByText("No 'See more' button when all text visible:");

    cy.percySnapshot();
  });
});
