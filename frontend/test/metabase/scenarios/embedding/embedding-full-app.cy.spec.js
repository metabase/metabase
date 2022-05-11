import { restore } from "__support__/e2e/cypress";

describe("scenarios > embedding > full app", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should hide top nav by default", () => {
    visitApp("/");
    cy.findByTestId("main-logo").should("not.exist");
  });

  it("should show top nav when enabled", () => {
    visitApp("/?top_nav=true");
    cy.findAllByTestId("main-logo").should("be.visible");
    cy.findByRole("button", { name: /New/ }).should("not.exist");
    cy.findByPlaceholderText("Search").should("not.exist");
  });

  it("should show question creation controls when enabled", () => {
    visitApp("/?top_nav=true&new_button=true");
    cy.findByRole("button", { name: /New/ }).should("be.visible");
  });

  it("should show search controls when enabled", () => {
    visitApp("/?top_nav=true&search=true");
    cy.findByPlaceholderText("Search…").should("be.visible");
  });
});

const visitApp = url => {
  cy.visit(url, {
    onBeforeLoad(window) {
      window.Cypress = undefined;
    },
  });
};
