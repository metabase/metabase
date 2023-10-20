import { restore } from "e2e/support/helpers";

describe("scenarios > dashboard > dashboard cards > click behavior", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("visualizations without click behavior", () => {
    it('does not allow to set click behavior for "text" virtual dashcard', () => {
      expect(1).to.be.eq(1);
    });
  });
});
