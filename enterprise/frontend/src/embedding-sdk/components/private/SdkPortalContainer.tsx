import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";

import { PublicComponentStylesWrapper } from "./PublicComponentStylesWrapper";

/**
 * This is the portal container used by popovers modals etc, it is wrapped with PublicComponentStylesWrapper
 * so that it has our styles applied.
 * Mantine components needs to have the defaultProps set to use `EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID` as target for the portal
 */
export const PortalContainer = () => (
  <PublicComponentStylesWrapper>
    <div id={EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID}></div>
  </PublicComponentStylesWrapper>
);
