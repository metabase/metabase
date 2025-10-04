export const commandPalette = () => cy.findByTestId("command-palette");
export const shortcutModal = () =>
  cy.findByRole("dialog", { name: "Shortcuts" });

export const openCommandPalette = () => cy.get("body").type("{ctrl+k}{cmd+k}");
export const openShortcutModal = () => cy.get("body").type("{shift+?}");

export const commandPaletteButton = () =>
  cy
    .findByTestId("app-bar")
    .findByRole("button", { name: /Search|Ask Metabot or search/ });

export const closeCommandPalette = () => cy.get("body").type("{esc}");

export const pressPageUp = () => cy.realPress("{pageup}");

export const pressPageDown = () => cy.realPress("{pagedown}");

export const pressHome = () => cy.realPress("{home}");

export const pressEnd = () => cy.realPress("{end}");

export const commandPaletteInput = () =>
  cy.findByPlaceholderText("Search for anything…");

export const commandPaletteSearch = (query, viewAll = true) => {
  cy.intercept("GET", "/api/search?q=*").as("paletteSearch");
  commandPaletteButton().click();
  commandPaletteInput().type(query);
  cy.wait("@paletteSearch");

  if (viewAll) {
    commandPalette()
      .findByRole("link", { name: /View and filter/ })
      .click();
  }
};

export const commandPaletteAction = (name) => cy.findByRole("option", { name });
