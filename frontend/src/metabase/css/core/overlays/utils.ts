// eslint-disable-next-line no-restricted-imports
import { within } from "@storybook/testing-library";

import { hidden } from "./constants";

export const findListboxWithOption = async (
  portalRoot: HTMLElement,
  optionText: string | RegExp,
) => {
  const listboxes = await within(portalRoot).findAllByRole("listbox", hidden);

  for (const listbox of listboxes) {
    try {
      await within(listbox).findByRole("option", {
        name: optionText,
        ...hidden,
      });
      return listbox;
    } catch (error) {
      // continue
    }
  }

  throw new Error(`No listbox found containing the option "${optionText}"`);
};
