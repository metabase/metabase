// eslint-disable-next-line no-restricted-imports
import { within } from "@storybook/testing-library";

import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";

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

/** Overlays are typically appended to a portal root. Normally it's
 * the <body>. In the SDK, it's a custom element. */
export const getPortalRootElement = () =>
  document.getElementById(EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID) ||
  document.body;
