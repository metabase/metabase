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
});
