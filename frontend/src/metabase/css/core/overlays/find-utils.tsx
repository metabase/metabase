// eslint-disable-next-line no-restricted-imports -- this is only used in stories
import { within } from "@storybook/test";

import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";
import { getRootElement } from "metabase/lib/get-root-element";

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
export const getPortalRootElement = () => {
  const rootElement = getRootElement();

  return (
    rootElement.querySelector(`#${EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID}`) ||
    rootElement
  );
};
