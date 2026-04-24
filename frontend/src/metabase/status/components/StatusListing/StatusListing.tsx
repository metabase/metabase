import { useBeforeUnload } from "react-use";
import { t } from "ttag";

import {
  PLUGIN_REMOTE_SYNC,
  PLUGIN_REPLACEMENT,
  PLUGIN_UPLOAD_MANAGEMENT,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { hasActiveUploads } from "metabase/redux/uploads";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useCheckActiveDownloadsBeforeUnload } from "metabase/status/hooks/use-check-active-downloads-before-unload";

import { AnalyticsExportStatus } from "../AnalyticsExportStatus";
import { DatabaseStatus } from "../DatabaseStatus";
import { DownloadsStatus } from "../DownloadsStatus";
import { FileUploadStatus } from "../FileUploadStatus";

import { StatusListingRoot } from "./StatusListing.styled";

export const StatusListing = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  const { progressModal } = PLUGIN_REMOTE_SYNC.useSyncStatus();

  const uploadInProgress = useSelector(hasActiveUploads);

  useBeforeUnload(
    uploadInProgress,
    t`CSV Upload in progress. Are you sure you want to leave?`,
  );

  useCheckActiveDownloadsBeforeUnload();

  return (
    <>
      <StatusListingRoot data-testid="status-root-container">
        {isAdmin && <DatabaseStatus />}
        {isAdmin && <PLUGIN_REPLACEMENT.SourceReplacementStatus />}
        <FileUploadStatus />
        <AnalyticsExportStatus />
        <DownloadsStatus />
        {isAdmin && <PLUGIN_UPLOAD_MANAGEMENT.GdriveSyncStatus />}
      </StatusListingRoot>
      {progressModal}
    </>
  );
};
