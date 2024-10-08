import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";

/** Click a Mantine <Select> component, view its options, and return info about them */
export const viewMantineSelectOptions = async ({
  within: withinElement,
}: {
  within?: HTMLElement;
} = {}) => {
  const combobox = withinElement
    ? await within(withinElement).findByRole("combobox")
    : await screen.findByRole("combobox");

  // The click listener is not on the combobox itself but on an <input> inside it
  const displayedOption = (await within(combobox).findByRole(
    "searchbox",
  )) as HTMLInputElement;

  await userEvent.click(displayedOption);

  const listbox = await screen.findByRole("listbox");
  const optionElements = await within(listbox).findAllByRole("option");
  const optionTextContents = optionElements.map(option => option.textContent);
  return {
    optionElements,
    optionTextContents,
    displayedOption,
  };
};
