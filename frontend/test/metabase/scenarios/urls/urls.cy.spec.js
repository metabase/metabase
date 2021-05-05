import { restore } from "__support__/e2e/cypress";

describe("URLs", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("browse databases", () => {
    ["/", "/browse"].forEach(url => {
      it(`should slugify database name when opening it from "${url}"`, () => {
        cy.visit(url);
        cy.findByText("Sample Dataset").click();
        cy.findByText("Sample Dataset");
        cy.url().should("match", /\/browse\/1-sample-dataset$/);
      });
    });
  });
});
