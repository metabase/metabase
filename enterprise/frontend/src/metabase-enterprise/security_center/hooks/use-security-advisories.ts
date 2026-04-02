import { useMemo } from "react";

import {
  useAcknowledgeAdvisoryMutation,
  useListSecurityAdvisoriesQuery,
} from "metabase/api";
import type { Advisory } from "metabase-types/api";

export function useSecurityAdvisories() {
  const { data: response, isLoading } = useListSecurityAdvisoriesQuery(
    undefined,
    { refetchOnMountOrArgChange: true },
  );
  const [acknowledgeAdvisory] = useAcknowledgeAdvisoryMutation();

  const advisories: Advisory[] = useMemo(
    () => response?.advisories ?? [],
    [response?.advisories],
  );

  return {
    data: advisories,
    lastCheckedAt: response?.last_checked_at ?? null,
    isLoading,
    acknowledgeAdvisory,
  };
}
