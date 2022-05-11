import { restore } from "__support__/e2e/cypress";

describe("scenarios > embedding > full app", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should hide the top nav by default", () => {
    visitApp("/");
    cy.findByTestId("main-logo").should("not.exist");
  });

  it("should show the top nav with a param", () => {
    visitApp("/?top_nav=true");
    cy.findAllByTestId("main-logo").should("be.visible");
  });
});

const visitApp = url => {
  cy.visit(url, {
    onBeforeLoad(window) {
      window.Cypress = undefined;
    },
  });
};
