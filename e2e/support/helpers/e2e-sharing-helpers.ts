export const sharingMenuButton = () => cy.findByTestId("sharing-menu-button");
export const sharingMenu = () => cy.findByTestId("sharing-menu");

export const openSharingMenu = (menuItemText?: string) => {
  sharingMenuButton().click();
  if (menuItemText) {
    sharingMenu().findByText(menuItemText).click();
  }
};

export const toggleAlertChannel = channel => {
  cy.findByText(channel).parent().find("input").click({ force: true });
};
