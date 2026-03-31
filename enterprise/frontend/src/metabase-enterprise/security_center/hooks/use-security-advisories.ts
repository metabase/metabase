import { useCallback } from "react";

import {
  useAcknowledgeAdvisoryMutation,
  useListSecurityAdvisoriesQuery,
} from "metabase/api";

import type { Advisory } from "../types";

export function useSecurityAdvisories() {
  const { data: response, isLoading } = useListSecurityAdvisoriesQuery();
  const [acknowledgeApi] = useAcknowledgeAdvisoryMutation();

  const advisories: Advisory[] = response?.advisories ?? [];
  const lastCheckedAt = response?.last_checked_at ?? null;

  const acknowledgeAdvisory = useCallback(
    (advisoryId: string) => {
      acknowledgeApi(advisoryId);
    },
    [acknowledgeApi],
  );

  return {
    data: advisories,
    lastCheckedAt,
    isLoading,
    acknowledgeAdvisory,
  };
}
