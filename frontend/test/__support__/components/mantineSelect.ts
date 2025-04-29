import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";

export type ViewMantineSelectOptionsParams = {
  /** This function will identify the root element of the select with
   * screen.findByRole("combobox") but you can also supply that root element
   * via this parameter */
  root?: HTMLElement;
  /** If supplied, this function will find the root element of the select with
   * await within(findWithinElement).findByRole("combobox") */
  findWithinElement?: HTMLElement;
};

/** Clicks a Mantine <Select> component, views its options, and returns info about them */
export const viewMantineSelectOptions = async ({
  findWithinElement,
  root,
}: ViewMantineSelectOptionsParams = {}) => {
  root ??= findWithinElement
    ? await within(findWithinElement).findByRole("textbox")
    : await screen.findByRole("textbox");

  await userEvent.click(root);

  const listbox = await screen.findByRole("listbox");
  const optionElements = await within(listbox).findAllByRole("option");
  const optionTextContents = optionElements.map((option) => option.textContent);
  return {
    optionElements,
    optionTextContents,
    displayedOption: root as HTMLInputElement,
  };
};
