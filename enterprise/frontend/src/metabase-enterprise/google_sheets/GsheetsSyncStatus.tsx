import { useEffect, useState } from "react";
import { usePrevious } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { reloadSettings } from "metabase/admin/settings/settings";
import { skipToken } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import StatusLarge from "metabase/status/components/StatusLarge";
import { useGetGsheetsFolderQuery } from "metabase-enterprise/api/gsheets";
import type { DatabaseId, Settings } from "metabase-types/api";

type GsheetsStatus = Settings["gsheets"]["status"];
type ErrorPayload = { data?: { message: string } };

export const GsheetsSyncStatus = () => {
  const gsheetsSetting = useSetting("gsheets") ?? { status: "not-connected" };
  const { status: settingStatus } = gsheetsSetting;
  const previousSettingStatus = usePrevious(settingStatus);
  const dispatch = useDispatch();
  const isAdmin = useSelector(getUserIsAdmin);
  const [forceHide, setForceHide] = useState(
    !isAdmin || settingStatus !== "loading",
  );
  const [syncError, setSyncError] = useState({ error: false, message: "" });
  const [dbId, setDbId] = useState<DatabaseId | undefined>();

  const shouldPoll = isAdmin && settingStatus === "loading";

  const { currentData: folderSync, error: apiError } = useGetGsheetsFolderQuery(
    shouldPoll ? undefined : skipToken,
    { pollingInterval: 3000 },
  );

  // if our polling endpoint changes away from loading, refresh the settings and show error, if any
  useEffect(() => {
    if (folderSync?.status !== "loading" || apiError) {
      if (apiError) {
        console.error((apiError as ErrorPayload)?.data?.message);

        setSyncError({
          error: true,
          // eslint-disable-next-line no-literal-metabase-strings -- admin UI
          message: t`Please check that the folder is shared with the Metabase Service Account.`,
        });
      }

      if (folderSync?.db_id) {
        setDbId(folderSync.db_id);
      }

      dispatch(reloadSettings());
    }
  }, [folderSync, dispatch, settingStatus, apiError]);

  useEffect(() => {
    // if our setting changed to loading from something else, reset the force hide and clear any errors
    if (settingStatus === "loading" && previousSettingStatus !== "loading") {
      setForceHide(false);
      setSyncError({
        error: false,
        message: "",
      });
    }

    // if our setting changed to not-connected from loading and we don't have an error, force hide
    if (
      settingStatus === "not-connected" &&
      previousSettingStatus === "loading" &&
      !syncError.error
    ) {
      setForceHide(true);
    }
  }, [settingStatus, previousSettingStatus, syncError]);

  if (forceHide || !isAdmin) {
    return null;
  }

  const displayStatus = match({
    folderSyncStatus: folderSync?.status,
    folderSyncError: syncError.error,
    settingStatus,
  })
    .returnType<GsheetsStatus>()
    .with({ folderSyncError: true }, () => "error")
    .with({ folderSyncStatus: "complete" }, () => "complete")
    .with({ settingStatus: "complete" }, () => "complete")
    .with({ folderSyncStatus: "loading" }, () => "loading")
    .with({ settingStatus: "loading" }, () => "loading")
    .otherwise(() => "loading");

  return (
    <GsheetsSyncStatusView
      status={displayStatus}
      db_id={dbId}
      error={syncError.message ?? ""}
      onClose={() => setForceHide(true)}
    />
  );
};

function GsheetsSyncStatusView({
  status,
  db_id,
  error,
  onClose,
}: {
  status: GsheetsStatus;
  db_id?: DatabaseId;
  error?: string;
  onClose: () => void;
}) {
  const title = match(status)
    .with("complete", () => t`Imported Google Sheets`)
    .with("error", () => t`Error importing Google Sheets`)
    .otherwise(() => t`Importing Google Sheets...`);

  const itemTitle = match(status)
    .with("complete", () => t`Start exploring`)
    .otherwise(() => t`Google Sheets`);

  if (error) {
    console.error(error);
  }

  const description = match(status)
    .with("complete", () => t`Files sync every 15 minutes`)
    .with(
      "error",
      () =>
        // eslint-disable-next-line no-literal-metabase-strings -- admin UI
        t`Please check that the folder is shared with the Metabase Service Account.`,
    )
    .otherwise(() => undefined);

  return (
    <StatusLarge
      status={{
        title,
        items: [
          {
            title: itemTitle,
            href:
              status === "complete" ? `/browse/databases/${db_id}` : undefined,
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
