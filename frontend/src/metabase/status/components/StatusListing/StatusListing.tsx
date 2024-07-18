import { useBeforeUnload } from "react-use";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { hasActiveUploads } from "metabase/redux/uploads";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useCheckActiveDownloadsBeforeUnload } from "metabase/status/hooks/use-check-active-downloads-before-unload";

import DatabaseStatus from "../../containers/DatabaseStatus";
import { DownloadsStatus } from "../DownloadsStatus";
import { FileUploadStatus } from "../FileUploadStatus";

import { StatusListingRoot } from "./StatusListing.styled";

const StatusListing = () => {
  const isAdmin = useSelector(getUserIsAdmin);

  const uploadInProgress = useSelector(hasActiveUploads);

  useBeforeUnload(
    uploadInProgress,
    t`CSV Upload in progress. Are you sure you want to leave?`,
  );

  useCheckActiveDownloadsBeforeUnload();

  return (
    <StatusListingRoot data-testid="status-root-container">
      {isAdmin && <DatabaseStatus />}
      <FileUploadStatus />
      <DownloadsStatus />
    </StatusListingRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StatusListing;
