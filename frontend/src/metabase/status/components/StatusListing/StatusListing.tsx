import { useBeforeUnload } from "react-use";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { getUserIsAdmin } from "metabase/current-user";
import {
  PLUGIN_AUDIT,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_REPLACEMENT,
  PLUGIN_UPLOAD_MANAGEMENT,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { hasActiveUploads } from "metabase/redux/uploads";
import { useCheckActiveDownloadsBeforeUnload } from "metabase/status/hooks/use-check-active-downloads-before-unload";
import { Box } from "metabase/ui";

import { DatabaseStatus } from "../DatabaseStatus";
import { DownloadsStatus } from "../DownloadsStatus";
import { FileUploadStatus } from "../FileUploadStatus";

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
      <Box
        className={CS.z2}
        pos="fixed"
        right="1.5rem"
        bottom="1.5rem"
        data-testid="status-root-container"
      >
        {isAdmin && <DatabaseStatus />}
        {isAdmin && <PLUGIN_REPLACEMENT.SourceReplacementStatus />}
        <FileUploadStatus />
        <PLUGIN_AUDIT.AnalyticsExportStatus />
        <DownloadsStatus />
        {isAdmin && <PLUGIN_UPLOAD_MANAGEMENT.GdriveSyncStatus />}
      </Box>
      {progressModal}
    </>
  );
};
