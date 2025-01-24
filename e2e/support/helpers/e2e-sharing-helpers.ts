import { H } from "e2e/support";

export const sharingMenuButton = () => cy.findByTestId("sharing-menu-button");
export const sharingMenu = () => cy.findByTestId("sharing-menu");

export const openSharingMenu = (menuItemText?: string) => {
  sharingMenuButton().click();
  if (menuItemText) {
    sharingMenu().findByText(menuItemText).click();
  }
};

export const removeNotificationHandlerChannel = (channel: string) => {
  H.modal()
    .findByText(channel)
    .closest('[data-testid="channel-block"]')
    .findByTestId("remove-channel-button")
    .click();
};

export const addNotificationHandlerChannel = (
  channel: string,
  { hasNoChannelsAdded = false }: { hasNoChannelsAdded?: boolean } = {},
) => {
  if (hasNoChannelsAdded) {
    H.modal().findByText("Add a destination").should("be.visible").click();
  } else {
    H.modal()
      .findByText("Add another destination")
      .should("be.visible")
      .click();
  }

  H.popover().findByText(channel).click();
};
