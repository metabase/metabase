import ZIndex from "metabase/css/core/z-index.module.css";
import { EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID } from "metabase/embedding-sdk/config";
import { Box } from "metabase/ui";

import { PublicComponentStylesWrapper } from "./PublicComponentStylesWrapper";
import S from "./SdkPortalContainer.style.css";

/**
 * This is the portal container used by popovers modals etc, it is wrapped with PublicComponentStylesWrapper
 * so that it has our styles applied.
 * Mantine components needs to have the defaultProps set to use `EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID` as target for the portal
 */
export const PortalContainer = () => (
  <PublicComponentStylesWrapper className={S.portalWrapper}>
    <Box
      id={EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID}
      className={ZIndex.Overlay}
      pos="fixed"
      left={0}
      top={0}
      w={"100%"}
    ></Box>
  </PublicComponentStylesWrapper>
);
