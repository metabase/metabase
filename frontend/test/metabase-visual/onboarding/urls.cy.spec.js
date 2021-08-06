import { restore } from "__support__/e2e/cypress";

describe("visual tests > onboarding > URLs", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("home", () => {
    cy.visit("/");
    cy.percySnapshot();
  });

  it("root collection", () => {
    cy.visit("/collection/root");
    cy.percySnapshot();
  });

  it("browse", () => {
    cy.visit("/browse/");
    cy.percySnapshot();
  });

  it("browse/1 (Sample Dataset)", () => {
    cy.visit("/browse/1");
    cy.percySnapshot();
  });
});
