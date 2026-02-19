import { useEffect, useState } from "react";
import { usePrevious } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { Api, skipToken } from "metabase/api";
import { tag } from "metabase/api/tags";
import { getErrorMessage } from "metabase/api/utils";
import { useDispatch, useSelector } from "metabase/lib/redux";
import StatusLarge from "metabase/status/components/StatusLarge";
import { useGetGsheetsFolderQuery } from "metabase-enterprise/api";
import { EnterpriseApi } from "metabase-enterprise/api/api";
import type { DatabaseId, GdrivePayload } from "metabase-types/api";

import { SYNC_POLL_INTERVAL } from "./constants";
import { getStatus, useShowGdrive } from "./utils";

type GsheetsStatus = GdrivePayload["status"];

export const GdriveSyncStatus = () => {
  const dispatch = useDispatch();
  const showGdrive = useShowGdrive();

  const [forceHide, setForceHide] = useState(true);
  const [dbId, setDbId] = useState<DatabaseId | undefined>();

  const res = useGetGsheetsFolderQuery(!showGdrive ? skipToken : undefined);
  const { data: gdriveFolder, error: apiError } = res;

  const currentUser = useSelector(getCurrentUser);
  const isCurrentUser = currentUser?.id === gdriveFolder?.created_by_id;

  const status = getStatus({ status: gdriveFolder?.status, error: apiError });

  const previousStatus = usePrevious(status);

  useEffect(() => {
    if (status === "syncing" && !forceHide) {
      const timeout = setTimeout(() => {
        dispatch(EnterpriseApi.util.invalidateTags(["gsheets-status"]));
      }, SYNC_POLL_INTERVAL);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [res, status, dispatch, forceHide]); // need res so this runs on every refetch

  useEffect(() => {
    // if our setting changed to loading from not-connected, show the status
    if (status === "syncing" && previousStatus === "not-connected") {
      setForceHide(false);
    }

    // if our setting changed to not-connected from loading, force hide
    if (status === "not-connected" && previousStatus === "syncing") {
      setForceHide(true);
    }

    if (status === "active" && gdriveFolder?.db_id !== dbId) {
      setDbId(gdriveFolder?.db_id);
    }

    // refetch tables once the sync completes
    if (status === "active" && previousStatus === "syncing") {
      dispatch(Api.util.invalidateTags([tag("table")]));
    }

    if (status === "error" && previousStatus === "syncing") {
      console.error(
        getErrorMessage(
          apiError,
          // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin only ui
          t`Please check that the folder is shared with the Metabase Service Account.`,
        ),
      );
    }
  }, [dispatch, status, previousStatus, gdriveFolder, dbId, apiError]);

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
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- admin UI
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
