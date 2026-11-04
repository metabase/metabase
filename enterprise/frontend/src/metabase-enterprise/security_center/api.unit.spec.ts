import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import {
  setupHealthChecksEndpoint,
  setupRecheckHealthChecksEndpoint,
} from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import {
  createAdvisory,
  createMockHealthCheck,
} from "metabase-types/api/mocks/security-center";

import {
  useAcknowledgeAdvisoriesMutation,
  useAcknowledgeAdvisoryMutation,
  useListHealthChecksQuery,
  useListSecurityAdvisoriesQuery,
  useRecheckHealthChecksMutation,
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

  it("should refresh the subscribed list after acknowledging an advisory", async () => {
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

  it("should refresh the subscribed list after acknowledging advisories in bulk", async () => {
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

  it("should refresh the subscribed list after syncing advisories", async () => {
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

describe("security-center re-check all", () => {
  const newerCheck = createMockHealthCheck({
    id: "https-site-url",
    status: "pass",
    checked_at: "2026-10-29T12:00:00Z",
  });
  const olderCheck = createMockHealthCheck({
    id: "https-site-url",
    status: "fail",
    checked_at: "2026-10-29T11:00:00Z",
  });

  it.each([
    {
      name: "keeps the cached check when it is newer than the response",
      cached: newerCheck,
      rechecked: olderCheck,
    },
    {
      name: "takes the response when it is newer than the cached check",
      cached: olderCheck,
      rechecked: newerCheck,
    },
  ])("$name", async ({ cached, rechecked }) => {
    setupHealthChecksEndpoint([cached]);
    setupRecheckHealthChecksEndpoint([rechecked]);
    const { result } = renderHookWithProviders(() => {
      const query = useListHealthChecksQuery();
      const [recheckAll] = useRecheckHealthChecksMutation();
      return { query, recheckAll };
    }, {});

    await waitFor(() => {
      expect(result.current.query.data?.checks).toEqual([cached]);
    });

    await act(async () => {
      await result.current.recheckAll().unwrap();
    });

    expect(result.current.query.data?.checks).toEqual([newerCheck]);
  });
});
