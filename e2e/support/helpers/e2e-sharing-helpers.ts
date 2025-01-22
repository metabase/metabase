import { H } from "e2e/support";

export const sharingMenuButton = () => cy.findByTestId("sharing-menu-button");
export const sharingMenu = () => cy.findByTestId("sharing-menu");

export const openSharingMenu = (menuItemText?: string) => {
  sharingMenuButton().click();
  if (menuItemText) {
    sharingMenu().findByText(menuItemText).click();
  }
};

export const toggleAlertChannel = (channel: string) => {
  cy.findByText(channel).parent().find("input").click({ force: true });
};

export const addNotificationHandlerChannel = (channel: string) => {
  cy.findByText("Add another destination").should("be.visible").click();
  H.popover().findByText(channel).click();
};
