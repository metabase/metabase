import { USERS } from "e2e/support/cypress_data";
import {
  commandPalette,
  commandPaletteButton,
  commandPaletteInput,
  restore,
  visitFullAppEmbeddingUrl,
} from "e2e/support/helpers";

["admin", "normal"].forEach(user => {
  describe(`search > ${user} user`, () => {
    beforeEach(() => {
      restore();
      cy.signIn(user);
      visitFullAppEmbeddingUrl({
        url: "/",
        qs: { top_nav: true, search: true },
      });
    });

    // There was no issue for this, but it was implemented in pull request #15614
    it("should be able to use typeahead search functionality", () => {
      const personalCollectionsLength =
        user === "admin" ? Object.entries(USERS).length : 1;

      cy.findByPlaceholderText("Search…").type("pers");
      cy.findByTestId("loading-spinner").should("not.exist");
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
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", "/api/setting/search-typeahead-enabled", {
      value: false,
    });
    cy.visit("/");
  });

  it("should not display search results in the palette when search-typeahead-enabled is false", () => {
    commandPaletteButton().click();
    commandPaletteInput().type("ord");
    commandPalette()
      .findByRole("option", { name: /View search results/ })
      .should("exist");
  });
});
