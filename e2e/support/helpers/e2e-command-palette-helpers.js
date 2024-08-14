export const commandPalette = () => cy.findByTestId("command-palette");

export const openCommandPalette = () => cy.get("body").type("{ctrl+k}{cmd+k}");

export const commandPaletteButton = () =>
  cy.findByTestId("app-bar").findByRole("button", { name: /Search/ });

export const closeCommandPalette = () => cy.get("body").type("{esc}");

export const pressPageUp = () => cy.get("body").type("{pageup}");

export const pressPageDown = () => cy.get("body").type("{pagedown}");

export const pressHome = () => cy.get("body").type("{home}");

export const pressEnd = () => cy.get("body").type("{end}");

export const commandPaletteInput = () =>
  cy.findByPlaceholderText("Search for anything or jump somewhere…");

export const commandPaletteSearch = (query, viewAll = true) => {
  cy.intercept("GET", "/api/search?q=*").as("paletteSearch");
  commandPaletteButton().click();
  commandPaletteInput().type(query);
  cy.wait("@paletteSearch");

  if (viewAll) {
    commandPalette()
      .findByRole("option", { name: /View and filter/ })
      .click();
  }
};
