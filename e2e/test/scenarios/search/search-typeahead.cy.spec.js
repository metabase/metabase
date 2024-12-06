import { H } from "e2e/support";
import { USERS } from "e2e/support/cypress_data";

["admin", "normal"].forEach(user => {
  describe(`search > ${user} user`, () => {
    beforeEach(() => {
      H.restore();
      cy.signIn(user);
      H.visitFullAppEmbeddingUrl({
        url: "/",
        qs: { top_nav: true, search: true },
      });
    });

    // There was no issue for this, but it was implemented in pull request #15614
    it("should be able to use typeahead search functionality", () => {
      const personalCollectionsLength =
        user === "admin" ? Object.entries(USERS).length : 1;

      cy.findByPlaceholderText("Search…").type("pers");
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByTestId("search-results-list").within(() => {
        cy.findAllByText(/personal collection$/i).should(
          "have.length",
          personalCollectionsLength,
        );
      });
    });
  });
});

describe("command palette", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("search-typeahead-enabled", false);
    cy.visit("/");
  });

  it("should not display search results in the palette when search-typeahead-enabled is false", () => {
    H.commandPaletteButton().click();
    H.commandPaletteInput().type("ord");
    H.commandPalette()
      .findByRole("option", { name: /View search results/ })
      .should("exist");
  });
});
