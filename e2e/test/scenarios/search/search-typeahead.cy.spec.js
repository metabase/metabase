const { H } = cy;

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
