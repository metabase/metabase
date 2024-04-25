import userEvent from "@testing-library/user-event";

import { screen, waitForLoaderToBeRemoved, within } from "__support__/ui";

export function getItemPickerHeader() {
  return screen.getByTestId("item-picker-header");
}

export function getItemPickerList() {
  return screen.getByTestId("item-picker-list");
}

export function queryListItem(itemName) {
  return within(getItemPickerList())
    .queryByText(itemName)
    .closest("[data-testid=item-picker-item]");
}

export async function openCollection(itemName) {
  const collectionNode = within(queryListItem(itemName));
  await userEvent.click(collectionNode.getByLabelText("chevronright icon"));
}

export async function openCollectionWait(itemName) {
  await openCollection(itemName);
  await waitForLoaderToBeRemoved();
}
