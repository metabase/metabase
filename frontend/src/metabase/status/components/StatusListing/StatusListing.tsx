import { useBeforeUnload } from "react-use";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { hasActiveUploads } from "metabase/redux/uploads";
import { getUserIsAdmin, getUser } from "metabase/selectors/user";

import DatabaseStatus from "../../containers/DatabaseStatus";
import { FileUploadStatus } from "../FileUploadStatus";

import { StatusListingRoot } from "./StatusListing.styled";

const StatusListing = () => {
  const isLoggedIn = !!useSelector(getUser);
  const isAdmin = useSelector(getUserIsAdmin);

  const uploadInProgress = useSelector(hasActiveUploads);

  useBeforeUnload(
    uploadInProgress,
    t`CSV Upload in progress. Are you sure you want to leave?`,
  );

  if (!isLoggedIn) {
    return null;
  }

  return (
    <StatusListingRoot data-testid="status-root-container">
      {isAdmin && <DatabaseStatus />}
      <FileUploadStatus />
    </StatusListingRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StatusListing;
