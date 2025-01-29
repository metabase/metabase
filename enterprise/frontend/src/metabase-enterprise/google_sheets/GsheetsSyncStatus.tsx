import { useEffect, useState } from "react";
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

export const GsheetsSyncStatus = () => {
  const gsheetsSetting = useSetting("gsheets");
  const { status } = gsheetsSetting;
  const isAdmin = useSelector(getUserIsAdmin);
  const [showStatus, setShowStatus] = useState(status === "loading" && isAdmin);
  const dispatch = useDispatch();

  const { data: folderSync } = useGetGsheetsFolderQuery(
    status === "loading" && showStatus ? undefined : skipToken,
    { pollingInterval: 3000 },
  );

  useEffect(() => {
    if (folderSync?.status !== "loading") {
      dispatch(reloadSettings());
    }
  }, [folderSync, dispatch]);

  if (!showStatus || !isAdmin) {
    return null;
  }

  const title = match(folderSync?.status)
    .with("complete", () => t`Imported Google Sheets`)
    .with("error", () => t`Error Importing Google Sheets`)
    .otherwise(() => t`Importing Google Sheets...`);

  const description = match(folderSync?.status)
    .with("complete", () => (
      <Link
        to={`browse/databases/${folderSync?.db_id}`}
      >{t`Start Exploring`}</Link>
    ))
    .with(
      "error",
      () =>
        t`There was an error importing your Google Sheets. ${folderSync?.error ?? ""}`,
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
            isAborted: folderSync?.status === "error",
          },
        ],
      }}
      isActive
      onDismiss={() => setShowStatus(false)}
    />
  );
};
