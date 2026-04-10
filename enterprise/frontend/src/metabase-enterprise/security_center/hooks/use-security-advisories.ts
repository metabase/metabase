import { useMemo } from "react";

import {
  useAcknowledgeAdvisoryMutation,
  useListSecurityAdvisoriesQuery,
} from "metabase/api";
import type { Advisory } from "metabase-types/api";

const POLLING_INTERVAL = 2000;

export function useSecurityAdvisories(isPolling = false) {
  const {
    data: response,
    isLoading,
    isError,
  } = useListSecurityAdvisoriesQuery(undefined, {
    refetchOnMountOrArgChange: true,
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });
  const [acknowledgeAdvisory] = useAcknowledgeAdvisoryMutation();

  const advisories: Advisory[] = useMemo(
    () => response?.advisories ?? [],
    [response?.advisories],
  );

  return {
    data: advisories,
    lastCheckedAt: response?.last_checked_at ?? null,
    isLoading,
    isError,
    acknowledgeAdvisory,
  };
}
