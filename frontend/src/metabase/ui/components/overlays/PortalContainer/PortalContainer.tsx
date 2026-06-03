import ZIndex from "metabase/css/core/z-index.module.css";
import { Box } from "metabase/ui";

import { PORTAL_CONTAINER_ID } from "./constants";

/**
 * Shared portal target for overlay components.
 */
export const PortalContainer = () => (
  <Box
    id={PORTAL_CONTAINER_ID}
    data-portal="true"
    className={ZIndex.Overlay}
    pos="fixed"
    left={0}
    top={0}
    w="100%"
  />
);
