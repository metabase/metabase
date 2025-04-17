import { modal, popover } from "e2e/support/helpers/e2e-ui-elements-helpers";

export const sharingMenuButton = () => cy.findByTestId("sharing-menu-button");
export const sharingMenu = () => cy.findByTestId("sharing-menu");

export const openSharingMenu = (menuItemText?: string) => {
  sharingMenuButton().click();
  if (menuItemText) {
    sharingMenu().findByText(menuItemText).click();
  }
};

export const removeNotificationHandlerChannel = (channel: string) => {
  modal()
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
    modal().findByText("Add a destination").should("be.visible").click();
  } else {
    modal().findByText("Add another destination").should("be.visible").click();
  }

  popover().findByText(channel).click();
};
