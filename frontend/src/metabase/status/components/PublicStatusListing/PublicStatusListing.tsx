import CS from "metabase/css/core/index.css";
import { useCheckActiveDownloadsBeforeUnload } from "metabase/status/hooks/use-check-active-downloads-before-unload";
import { Box } from "metabase/ui";

import { DownloadsStatus } from "../DownloadsStatus";

export const PublicStatusListing = () => {
  useCheckActiveDownloadsBeforeUnload();

  return (
    <Box
      className={CS.z2}
      pos="fixed"
      right="1.5rem"
      bottom="1.5rem"
      data-testid="status-root-container"
    >
      <DownloadsStatus />
    </Box>
  );
};
