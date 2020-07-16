import { restore, signInAsAdmin } from "../../../__support__/cypress";

describe("scenarios > x-rays", () => {
    before(restore);
    beforeEach(signInAsAdmin);
  
    it("should exist when person first signs in", () => {
        cy.visit("/");
        cy.pause();
    });

    it("should exist after text-box is added", () => {

    });
});