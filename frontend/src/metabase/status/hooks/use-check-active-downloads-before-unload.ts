import { useBeforeUnload } from "react-use";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { hasActiveDownloads } from "metabase/redux/downloads";

export const useCheckActiveDownloadsBeforeUnload = () => {
  const downloadInProgress = useSelector(hasActiveDownloads);
  useBeforeUnload(
    downloadInProgress,
    t`Export in progress. Are you sure you want to leave?`,
  );
};
