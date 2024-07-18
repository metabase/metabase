import { useCheckActiveDownloadsBeforeUnload } from "metabase/status/hooks/use-check-active-downloads-before-unload";

import { DownloadsStatus } from "../DownloadsStatus";

import { PublicStatusListingRoot } from "./PublicStatusListing.styled";

export const PublicStatusListing = () => {
  useCheckActiveDownloadsBeforeUnload();

  return (
    <PublicStatusListingRoot data-testid="status-root-container">
      <DownloadsStatus />
    </PublicStatusListingRoot>
  );
};
