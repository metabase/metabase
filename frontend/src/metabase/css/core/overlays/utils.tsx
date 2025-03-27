import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";

/** Overlays are typically appended to a portal root. Normally it's
 * the <body>. In the SDK, it's a custom element. */
export const getPortalRootElement = (rootElement: HTMLElement) => {
  return (
    rootElement.querySelector(`#${EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID}`) ||
    rootElement
  );
};
