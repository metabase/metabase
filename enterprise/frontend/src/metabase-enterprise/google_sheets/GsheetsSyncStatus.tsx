import { useEffect, useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import StatusLarge from "metabase/status/components/StatusLarge";
import { useGetGsheetsFolderQuery } from "metabase-enterprise/api/gsheets";

export const GsheetsSyncStatus = () => {
  const gsheetsSetting = useSetting("gsheets");
  const { status } = gsheetsSetting;
  const [showStatus, setShowStatus] = useState(status === "loading");

  const { data: folderSync } = useGetGsheetsFolderQuery(
    status !== "loading" || !showStatus ? skipToken : undefined,
    { pollingInterval: 3000 },
  );

  useEffect(() => {
    if (folderSync && folderSync.status === "complete") {
      setShowStatus(false);
    }
  }, [folderSync]);

  if (!showStatus) {
    return null;
  }

  return (
    <StatusLarge
      status={{
        title: t`Importing Google Sheets...`,
        items: [{
          title: t`Google Sheets`,
          icon: "google_drive",
          description: folderSync?.status === "complete"
           ? <Link to={`browse/databases/${folderSync?.db_id}`}>{t`Start Exploring`}</Link>
           : undefined,
          isInProgress: folderSync?.status !== "complete",
          isCompleted: folderSync?.status === "complete",
          isAborted: false,
        }]
      }}
      isActive
      onDismiss={() => setShowStatus(false)}
    />
  );
};
