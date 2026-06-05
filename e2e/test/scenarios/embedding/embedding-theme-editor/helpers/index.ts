import { main } from "e2e/support/helpers";

export function createThemeViaApi(name = "Test theme") {
  return cy.request("POST", "/api/embed-theme", {
    name,
    settings: { colors: { brand: "#509EE3" } },
  });
}

export function deleteAllThemes() {
  cy.request("GET", "/api/embed-theme").then(({ body: themes }) => {
    themes.forEach((theme: { id: number }) => {
      cy.request("DELETE", `/api/embed-theme/${theme.id}`);
    });
  });
}

export const getThemeCard = (themeName: string) =>
  main().findByText(themeName).parent();

export function openThemeActionMenu(themeName: string) {
  getThemeCard(themeName).findByLabelText("Duplicate and delete").click();
}

export function clickThemeMenuItem(themeName: string, menuItemLabel: string) {
  openThemeActionMenu(themeName);
  cy.findByRole("menuitem", { name: menuItemLabel }).click();
}
