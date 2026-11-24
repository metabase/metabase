import {
  useAcknowledgeAdvisoriesMutation,
  useAcknowledgeAdvisoryMutation,
  useListSecurityAdvisoriesQuery,
} from "../api";

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
  const [acknowledgeAdvisories] = useAcknowledgeAdvisoriesMutation();

  return {
    data: response?.advisories ?? [],
    lastCheckedAt: response?.last_checked_at ?? null,
    lastSyncAttemptedAt: response?.last_sync_attempted_at ?? null,
    lastSyncError: response?.last_sync_error ?? null,
    isLoading,
    isError,
    acknowledgeAdvisory,
    acknowledgeAdvisories,
  };
}
