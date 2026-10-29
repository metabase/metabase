import { useEffect, useRef, useState } from "react";

import { useDispatch } from "metabase/redux";
import {
  EnterpriseApi,
  useListMetadataGenerationRunsQuery,
} from "metabase-enterprise/api";
import type { DatabaseId, MetadataGenerationRun } from "metabase-types/api";

import { RUN_POLLING_INTERVAL, getRunEndTags, isRunActive } from "./utils";

/**
 * Keeps the run query polling while the run is active, or while `isActive` is undefined because the run is not
 * loaded yet. When a run seen as active ends, it refreshes the runs, the pending proposals and their previews. A run
 * that is not active when it loads causes no refresh.
 */
export function useRunPolling(
  isActive: boolean | undefined,
  setIsPolling: (isPolling: boolean) => void,
) {
  const dispatch = useDispatch();
  const wasActive = useRef(false);

  useEffect(() => {
    if (isActive === undefined) {
      setIsPolling(true);
      return;
    }
    setIsPolling(isActive);
    if (wasActive.current && !isActive) {
      dispatch(EnterpriseApi.util.invalidateTags(getRunEndTags()));
    }
    wasActive.current = isActive;
  }, [dispatch, isActive, setIsPolling]);
}

/**
 * The latest run of the database, and the same run as `activeRun` while it is active. The runs list polls while a
 * run is active, so each component that calls this hook refreshes the pending proposals and previews when the run
 * ends.
 */
export function useDatabaseRun(databaseId: DatabaseId): {
  latestRun: MetadataGenerationRun | null;
  activeRun: MetadataGenerationRun | null;
} {
  const [hasActiveRun, setHasActiveRun] = useState(false);
  const { data: runs } = useListMetadataGenerationRunsQuery(
    { database_id: databaseId },
    { pollingInterval: hasActiveRun ? RUN_POLLING_INTERVAL : 0 },
  );
  const latestRun = runs?.[0] ?? null;
  const activeRun =
    latestRun != null && isRunActive(latestRun) ? latestRun : null;
  useRunPolling(activeRun != null, setHasActiveRun);
  return { latestRun, activeRun };
}
