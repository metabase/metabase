import { restore } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";

["admin", "normal"].forEach(user => {
  describe(`search > ${user} user`, () => {
    beforeEach(() => {
      restore();
      cy.signIn(user);
      cy.visit("/");
    });

    // There was no issue for this, but it was implemented in pull request #15614
    it("should be able to use typeahead search functionality", () => {
      const personalCollectionsLength =
        user === "admin" ? Object.entries(USERS).length : 1;

      cy.findByPlaceholderText("Search…").type("pers");
      cy.get(".LoadingSpinner").should("not.exist");
      cy.findAllByText(/personal collection$/i).should(
        "have.length",
        personalCollectionsLength,
      );
    });
  });
});
