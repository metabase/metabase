import { useEffect, useState } from "react";
import { t } from "ttag";

import { reloadSettings } from "metabase/admin/settings/settings";
import { skipToken } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import { useDispatch } from "metabase/lib/redux";
import StatusLarge from "metabase/status/components/StatusLarge";
import { useGetGsheetsFolderQuery } from "metabase-enterprise/api/gsheets";

export const GsheetsSyncStatus = () => {
  const gsheetsSetting = useSetting("gsheets");
  const { status } = gsheetsSetting;
  const [showStatus, setShowStatus] = useState(status === "loading");
  const dispatch = useDispatch();

  const { data: folderSync } = useGetGsheetsFolderQuery(
    status === "loading" ? undefined : skipToken,
    { pollingInterval: 3000 },
  );

  const isComplete = folderSync?.status === "complete";

  useEffect(() => {
    // sync up the settings status with the folder sync status
    if (status === "loading" && isComplete) {
      dispatch(reloadSettings());
    }
  }, [isComplete, status, dispatch]);

  if (status !== "loading" && !showStatus) {
    return null;
  }

  return (
    <StatusLarge
      status={{
        title: isComplete
          ? t`Imported Google Sheets`
          : t`Importing Google Sheets...`,
        items: [
          {
            title: t`Google Sheets`,
            icon: "google_drive",
            description: isComplete ? (
              <Link
                to={`browse/databases/${folderSync?.db_id}`}
              >{t`Start Exploring`}</Link>
            ) : undefined,
            isInProgress: !isComplete,
            isCompleted: isComplete,
            isAborted: false,
          },
        ],
      }}
      isActive
      onDismiss={() => setShowStatus(false)}
    />
  );
};
