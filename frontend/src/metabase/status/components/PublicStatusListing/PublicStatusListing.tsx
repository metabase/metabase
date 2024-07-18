import { DownloadsStatus } from "../DownloadsStatus";

import { PublicStatusListingRoot } from "./PublicStatusListing.styled";

export const PublicStatusListing = () => {
  return (
    <PublicStatusListingRoot data-testid="status-root-container">
      <DownloadsStatus />
    </PublicStatusListingRoot>
  );
};
