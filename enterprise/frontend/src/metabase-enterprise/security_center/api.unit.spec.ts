import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { renderHookWithProviders, waitFor } from "__support__/ui";

import {
  useAcknowledgeAdvisoriesMutation,
  useAcknowledgeAdvisoryMutation,
  useListSecurityAdvisoriesQuery,
  useSyncSecurityAdvisoriesMutation,
} from "./api";

describe("security-center cache invalidation", () => {
  it.each(["acknowledge", "acknowledgeAll", "sync"] as const)(
    "refreshes the subscribed advisory list after %s",
    async (operation) => {
      const listUrl = "path:/api/ee/security-center";
      let refreshed = false;
      fetchMock.get(listUrl, () => ({
        advisories: [],
        last_checked_at: refreshed ? "2026-09-10T00:00:00Z" : null,
      }));
      fetchMock.post("path:/api/ee/security-center/SA-001/acknowledge", {});
      fetchMock.post("path:/api/ee/security-center/acknowledge", []);
      fetchMock.post("path:/api/ee/security-center/sync", 200);

      const { result, unmount } = renderHookWithProviders(() => {
        const query = useListSecurityAdvisoriesQuery();
        const [acknowledge] = useAcknowledgeAdvisoryMutation();
        const [acknowledgeAll] = useAcknowledgeAdvisoriesMutation();
        const [sync] = useSyncSecurityAdvisoriesMutation();
        return {
          query,
          acknowledge: () => acknowledge("SA-001"),
          acknowledgeAll: () => acknowledgeAll(["SA-001"]),
          sync,
        };
      }, {});

      await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
      expect(result.current.query.data?.last_checked_at).toBeNull();
      refreshed = true;

      await act(async () => {
        await result.current[operation]();
      });

      await waitFor(() => {
        expect(result.current.query.data?.last_checked_at).toBe(
          "2026-09-10T00:00:00Z",
        );
      });
      expect(fetchMock.callHistory.calls(listUrl)).toHaveLength(2);
      unmount();
    },
  );
});
