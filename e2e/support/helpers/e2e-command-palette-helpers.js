export const commandPalette = () => cy.findByTestId("command-palette");
export const openCommandPalette = () => cy.get("body").type("{ctrl+k}");
export const closeCommandPalette = () => cy.get("body").type("{esc}");
export const commandPaletteSearch = () =>
  cy.findByPlaceholderText("Jump to...");
