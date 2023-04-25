import React from "react";
import { t } from "ttag";
import { useSelector } from "react-redux";
import { useBeforeUnload } from "react-use";

import { getUserIsAdmin, getUser } from "metabase/selectors/user";
import { hasActiveUploads } from "metabase/redux/uploads";

import DatabaseStatus from "../../containers/DatabaseStatus";
import FileUploadStatus from "../FileUploadStatus";
import { StatusListingRoot } from "./StatusListing.styled";

const StatusListingView = () => {
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
    <StatusListingRoot>
      {isAdmin && <DatabaseStatus />}
      <FileUploadStatus />
    </StatusListingRoot>
  );
};

export default StatusListingView;
