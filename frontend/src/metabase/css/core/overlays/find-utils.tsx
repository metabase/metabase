// eslint-disable-next-line no-restricted-imports -- this is only used in stories
import { within } from "@storybook/test";

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
