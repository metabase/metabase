import { restore } from "__support__/cypress";

describe("scenarios > happypath > core usage", () => {
    // Much of this setup is already done in setup.cy.spec.js
    // So we egregiously borrow from there, but assume the person did everything right.
    describe("admin setup", () => {
      before(() => restore("blank"));
  
      it("signs up as a brand new Metabase person!", () => {
        cy.visit("/");
        cy.url().should("be", "/setup");
      })
    })
})