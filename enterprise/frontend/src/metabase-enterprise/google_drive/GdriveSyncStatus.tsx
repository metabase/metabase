import { useEffect, useState } from "react";
import { usePrevious } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { skipToken } from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import StatusLarge from "metabase/status/components/StatusLarge";
import { useGetGsheetsFolderQuery } from "metabase-enterprise/api";
import { EnterpriseApi } from "metabase-enterprise/api/api";
import type { DatabaseId, GdrivePayload } from "metabase-types/api";

import { SYNC_POLL_INTERVAL } from "./constants";
import { useShowGdrive } from "./utils";

type GsheetsStatus = GdrivePayload["status"];
type ErrorPayload = { data?: { message: string } };

export const GdriveSyncStatus = () => {
  const dispatch = useDispatch();
  const showGdrive = useShowGdrive();

  const [forceHide, setForceHide] = useState(true);
  const [syncError, setSyncError] = useState({ error: false, message: "" });
  const [dbId, setDbId] = useState<DatabaseId | undefined>();

  const res = useGetGsheetsFolderQuery(!showGdrive ? skipToken : undefined);
  const { currentData: gdriveFolder, error: apiError } = res;

  const currentUser = useSelector(getCurrentUser);
  const isCurrentUser = currentUser?.id === gdriveFolder?.created_by_id;

  const status = match({
    apiStatus: gdriveFolder?.status,
    folderSyncError: syncError.error,
  })
    .returnType<GsheetsStatus>()
    .with({ folderSyncError: true }, () => "error")
    .with({ apiStatus: "active" }, () => "active")
    .with({ apiStatus: "syncing" }, () => "syncing")
    .otherwise(() => "not-connected");

  const previousStatus = usePrevious(status);

  useEffect(() => {
    if (status === "syncing") {
      const timeout = setTimeout(() => {
        dispatch(EnterpriseApi.util.invalidateTags(["gsheets-status"]));
      }, SYNC_POLL_INTERVAL);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [res, status, dispatch]); // need res so this runs on every refetch

  // if our polling endpoint changes away from loading
  useEffect(() => {
    if (status !== "syncing") {
      if (status === "error") {
        console.error((apiError as ErrorPayload)?.data?.message);

        setSyncError({
          error: true,
          // eslint-disable-next-line no-literal-metabase-strings -- admin UI
          message: t`Please check that the folder is shared with the Metabase Service Account.`,
        });
      }

      if (gdriveFolder?.db_id) {
        setDbId(gdriveFolder.db_id);
      }
    }
  }, [status, gdriveFolder, apiError]);

  useEffect(() => {
    // if our setting changed to loading from something else, reset the force hide and clear any errors
    if (status === "syncing" && previousStatus !== "syncing") {
      setForceHide(false);
      setSyncError({
        error: false,
        message: "",
      });
    }

    // if our setting changed to not-connected from loading and we don't have an error, force hide
    if (
      status === "not-connected" &&
      previousStatus === "syncing" &&
      !syncError.error
    ) {
      setForceHide(true);
    }
  }, [status, previousStatus, syncError]);

  if (forceHide || !isCurrentUser) {
    return null;
  }

  return (
    <GsheetsSyncStatusView
      status={status}
      db_id={dbId}
      onClose={() => setForceHide(true)}
    />
  );
};

function GsheetsSyncStatusView({
  status,
  db_id,
  onClose,
}: {
  status: GsheetsStatus;
  db_id?: DatabaseId;
  onClose: () => void;
}) {
  const title = match(status)
    .with("active", () => t`Imported Google Sheets`)
    .with("error", () => t`Error importing Google Sheets`)
    .otherwise(() => t`Importing Google Sheets...`);

  const itemTitle = match(status)
    .with("active", () => t`Start exploring`)
    .otherwise(() => t`Google Sheets`);

  const description = match(status)
    .with("active", () => t`Files sync every 15 minutes`)
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
              status === "active" ? `/browse/databases/${db_id}` : undefined,
            icon: "google_drive",
            description,
            isInProgress: status === "syncing",
            isCompleted: status === "active",
            isAborted: status === "error",
          },
        ],
      }}
      isActive
      onDismiss={onClose}
    />
  );
}
