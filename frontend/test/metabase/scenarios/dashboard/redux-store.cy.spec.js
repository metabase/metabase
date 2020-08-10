import { restore, signInAsAdmin } from "../../../__support__/cypress";
// Mostly ported from `dashboard.e2e.spec.js`

describe("scenarios > dashboard > redux-store", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should add the parameter values to state tree for public dashboard", () => {
    cy.visit("/dashboard/1");
    cy.window().its("store").invoke("getState");
    cy.pause();
  });
});
