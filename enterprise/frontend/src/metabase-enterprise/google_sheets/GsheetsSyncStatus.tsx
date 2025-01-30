import { useEffect, useRef, useState } from "react";
import { usePrevious } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { reloadSettings } from "metabase/admin/settings/settings";
import { skipToken } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import StatusLarge from "metabase/status/components/StatusLarge";
import { useGetGsheetsFolderQuery } from "metabase-enterprise/api/gsheets";
import type { DatabaseId, Settings } from "metabase-types/api";

type GsheetsStatus = Settings["gsheets"]["status"];
type ErrorPayload = { data?: { message: string } };

export const GsheetsSyncStatus = () => {
  const gsheetsSetting = useSetting("gsheets");
  const { status: settingStatus } = gsheetsSetting;
  const previousSettingStatus = usePrevious(settingStatus);
  const dispatch = useDispatch();
  const isAdmin = useSelector(getUserIsAdmin);
  const [forceHide, setForceHide] = useState(!isAdmin || settingStatus !== "loading");
  const syncError = useRef<{ error: boolean, message?: string }>({ error: false });

  const shouldPoll = isAdmin && !syncError.current.error && !forceHide;

  const { data: folderSync, error: folderSyncError} = useGetGsheetsFolderQuery(
    shouldPoll ? undefined : skipToken,
    { pollingInterval: 3000 },
  );

  if (folderSyncError) {
    // if there is an error from the folder query, we want to stop polling and save the error
    syncError.current = { error: true, message: (folderSyncError as ErrorPayload)?.data?.message };
  }

  // if our polling endpoint changes away from loading, refresh the settings
  useEffect(() => {
    if (folderSync?.status !== "loading") {
      dispatch(reloadSettings());
    }
  }, [folderSync, dispatch, settingStatus]);

  // if our setting changed to loading from something else, reset the force hide
  useEffect(() => {
    if (settingStatus === "loading" && previousSettingStatus !== "loading") {
      setForceHide(false);
      syncError.current = { error: false };
    }
  }, [settingStatus, previousSettingStatus, syncError]);

  if (forceHide || !isAdmin) {
    return null;
  }

  const displayStatus = match({
    folderSyncStatus: folderSync?.status,
    folderSyncError: syncError.current?.error,
    settingStatus,
  })
    .returnType<GsheetsStatus>()
    .with({ folderSyncError: true }, () => "error")
    .with({ settingStatus: "error" }, () => "error")
    .with({ folderSyncStatus: "complete" }, () => "complete")
    .with({ settingStatus: "complete" }, () => "complete")
    .with({ folderSyncStatus: "loading" }, () => "loading")
    .with({ settingStatus: "loading" }, () => "loading")
    .otherwise(() => "loading");

  return(
    <GsheetsSyncStatusView
      status={displayStatus}
      db_id={folderSync?.db_id}
      error={syncError.current.message ?? ''}
      onClose={() => setForceHide(true)}
    />
  );
};

function GsheetsSyncStatusView({ status, db_id, error, onClose }: {
  status: GsheetsStatus;
  db_id?: DatabaseId;
  error?: string;
  onClose: () => void;
}) {
  const title = match(status)
    .with("complete", () => t`Imported Google Sheets`)
    .with("error", () => t`Error importing Google Sheets`)
    .otherwise(() => t`Importing Google Sheets...`);

  const description = match(status)
    .with("complete", () => (
      <Link
        to={`browse/databases/${db_id}`}
      >{t`Start Exploring`}</Link>
    ))
    .with(
      "error",
      () =>
        t`There was an error importing your Google Sheets. ${error}`,
    )
    .otherwise(() => undefined);

  return (
    <StatusLarge
      status={{
        title,
        items: [
          {
            title: t`Google Sheets`,
            icon: "google_drive",
            description,
            isInProgress: status === "loading",
            isCompleted: status === "complete",
            isAborted: status === "error",
          },
        ],
      }}
      isActive
      onDismiss={onClose}
    />
  );
}
