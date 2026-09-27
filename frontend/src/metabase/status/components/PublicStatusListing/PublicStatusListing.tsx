import { useCheckActiveDownloadsBeforeUnload } from "metabase/status/hooks/use-check-active-downloads-before-unload";
import { Box } from "metabase/ui";

import { DownloadsStatus } from "../DownloadsStatus";

import S from "./PublicStatusListing.module.css";

export const PublicStatusListing = () => {
  useCheckActiveDownloadsBeforeUnload();

  return (
    <Box className={S.root} pos="fixed" data-testid="status-root-container">
      <DownloadsStatus />
    </Box>
  );
};
