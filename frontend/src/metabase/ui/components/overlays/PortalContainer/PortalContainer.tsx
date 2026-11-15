import { Box } from "metabase/ui";

import { PORTAL_CONTAINER_ID } from "./constants";

export const PortalContainer = () => (
  <Box id={PORTAL_CONTAINER_ID} data-portal="true" display="contents" />
);
