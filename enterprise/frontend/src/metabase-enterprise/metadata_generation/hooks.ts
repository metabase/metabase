import { useEffect, useRef } from "react";

import { useDispatch } from "metabase/redux";
import { EnterpriseApi } from "metabase-enterprise/api";

import { getRunEndTags } from "./utils";

/**
 * Keeps the run query polling while the run is active. When the run ends, it refreshes the runs, the pending
 * proposals and their previews.
 */
export function useRunPolling(
  isActive: boolean,
  setIsPolling: (isPolling: boolean) => void,
) {
  const dispatch = useDispatch();
  const wasActive = useRef(isActive);

  useEffect(() => {
    setIsPolling(isActive);
    if (wasActive.current && !isActive) {
      dispatch(EnterpriseApi.util.invalidateTags(getRunEndTags()));
    }
    wasActive.current = isActive;
  }, [dispatch, isActive, setIsPolling]);
}
