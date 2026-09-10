import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createAdvisory } from "metabase-types/api/mocks/security-center";

import {
  useAcknowledgeAdvisoriesMutation,
  useAcknowledgeAdvisoryMutation,
  useListSecurityAdvisoriesQuery,
  useSyncSecurityAdvisoriesMutation,
} from "./api";

const LIST_URL = "path:/api/ee/security-center";
const advisory = createAdvisory({ advisory_id: "SA-001" });

function mockRefreshedAdvisories() {
  fetchMock.modifyRoute("advisories", {
    response: { advisories: [], last_checked_at: "2026-09-10T00:00:00Z" },
  });
}

describe("security-center cache invalidation", () => {
  beforeEach(() => {
    fetchMock.get(
      LIST_URL,
      { advisories: [advisory], last_checked_at: null },
      { name: "advisories" },
    );
  });

  it("refreshes the subscribed list after acknowledging an advisory", async () => {
    fetchMock.post("path:/api/ee/security-center/SA-001/acknowledge", advisory);
    const { result } = renderHookWithProviders(() => {
      const query = useListSecurityAdvisoriesQuery();
      const [acknowledge] = useAcknowledgeAdvisoryMutation();
      return { query, acknowledge };
    }, {});

    await waitFor(() => {
      expect(result.current.query.data?.advisories).toEqual([advisory]);
    });
    mockRefreshedAdvisories();

    await act(async () => {
      await result.current.acknowledge("SA-001").unwrap();
    });

    await waitFor(() => {
      expect(result.current.query.data?.advisories).toEqual([]);
    });
    expect(fetchMock.callHistory.calls(LIST_URL)).toHaveLength(2);
  });

  it("refreshes the subscribed list after acknowledging advisories in bulk", async () => {
    fetchMock.post("path:/api/ee/security-center/acknowledge", [advisory]);
    const { result } = renderHookWithProviders(() => {
      const query = useListSecurityAdvisoriesQuery();
      const [acknowledgeAll] = useAcknowledgeAdvisoriesMutation();
      return { query, acknowledgeAll };
    }, {});

    await waitFor(() => {
      expect(result.current.query.data?.advisories).toEqual([advisory]);
    });
    mockRefreshedAdvisories();

    await act(async () => {
      await result.current.acknowledgeAll(["SA-001"]).unwrap();
    });

    await waitFor(() => {
      expect(result.current.query.data?.advisories).toEqual([]);
    });
    expect(fetchMock.callHistory.calls(LIST_URL)).toHaveLength(2);
  });

  it("refreshes the subscribed list after syncing advisories", async () => {
    fetchMock.post("path:/api/ee/security-center/sync", 200);
    const { result } = renderHookWithProviders(() => {
      const query = useListSecurityAdvisoriesQuery();
      const [sync] = useSyncSecurityAdvisoriesMutation();
      return { query, sync };
    }, {});

    await waitFor(() => {
      expect(result.current.query.data?.advisories).toEqual([advisory]);
    });
    mockRefreshedAdvisories();

    await act(async () => {
      await result.current.sync().unwrap();
    });

    await waitFor(() => {
      expect(result.current.query.data?.advisories).toEqual([]);
    });
    expect(fetchMock.callHistory.calls(LIST_URL)).toHaveLength(2);
  });
});
