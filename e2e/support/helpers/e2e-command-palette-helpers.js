export const commandPalette = () => cy.findByTestId("command-palette");
export const openCommandPalette = () => cy.get("body").type("{ctrl+k}{cmd+k}");
export const closeCommandPalette = () => cy.get("body").type("{esc}");
export const pressPageUp = () => cy.get("body").type("{pageup}");
export const pressPageDown = () => cy.get("body").type("{pagedown}");
export const pressHome = () => cy.get("body").type("{home}");
export const pressEnd = () => cy.get("body").type("{end}");
export const commandPaletteSearch = () =>
  cy.findByPlaceholderText("Jump to...");
