import { useBeforeUnload } from "react-use";
import { t } from "ttag";

import { hasActiveDownloads } from "metabase/redux/downloads";
import { useSelector } from "metabase/utils/redux";

export const useCheckActiveDownloadsBeforeUnload = () => {
  const downloadInProgress = useSelector(hasActiveDownloads);
  useBeforeUnload(
    downloadInProgress,
    t`Export in progress. Are you sure you want to leave?`,
  );
};
