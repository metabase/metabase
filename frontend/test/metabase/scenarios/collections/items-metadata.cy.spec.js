import { restore } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";

describe("scenarios > collection items metadata", () => {
  beforeEach(() => {
    restore();
  });

  describe("last editor", () => {
    it("should display if user is the last editor", () => {
      cy.signInAsAdmin();
      cy.visit("/dashboard/1");
      cy.findByText(/Edited .* by you/i);
      cy.visit("/question/1");
      cy.findByText(/Edited .* by you/i);
    });

    it("should display last editor's name", () => {
      const { first_name, last_name } = USERS.admin;
      // Example: John Doe —> John D.
      const expectedName = `${first_name} ${last_name.charAt(0)}.`;

      cy.signIn("normal");
      cy.visit("/dashboard/1");
      cy.findByText(new RegExp(`Edited .* by ${expectedName}`, "i"));
      cy.visit("/question/1");
      cy.findByText(new RegExp(`Edited .* by ${expectedName}`, "i"));
    });
  });
});
