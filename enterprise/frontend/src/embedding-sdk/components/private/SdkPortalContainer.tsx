import ZIndex from "metabase/css/core/z-index.module.css";
import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";
import { Box } from "metabase/ui";

import { PublicComponentStylesWrapper } from "./PublicComponentStylesWrapper";

/**
 * This is the portal container used by popovers modals etc, it is wrapped with PublicComponentStylesWrapper
 * so that it has our styles applied.
 * Mantine components needs to have the defaultProps set to use `EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID` as target for the portal
 */
export const PortalContainer = () => (
  <PublicComponentStylesWrapper>
    <Box
      id={EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID}
      className={ZIndex.Overlay}
      // needed otherwise it will rendered "in place" and push the content below
      pos="fixed"
      left={0}
      top={0}
      w={"100%"}
    ></Box>
  </PublicComponentStylesWrapper>
);
