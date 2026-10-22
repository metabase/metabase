import fetchMock from "fetch-mock";

import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createAdvisory } from "metabase-types/api/mocks/security-center";

import { useSecurityAdvisories } from "./use-security-advisories";

const LIST_URL = "path:/api/ee/security-center";

describe("useSecurityAdvisories", () => {
  it("returns the advisories and the last checked time from the response", async () => {
    const advisory = createAdvisory({ advisory_id: "SA-001" });
    fetchMock.get(LIST_URL, {
      advisories: [advisory],
      last_checked_at: "2026-09-10T00:00:00Z",
    });

    const { result } = renderHookWithProviders(
      () => useSecurityAdvisories(),
      {},
    );

    await waitFor(() => {
      expect(result.current.data).toEqual([advisory]);
    });
    expect(result.current.lastCheckedAt).toBe("2026-09-10T00:00:00Z");
  });

  it("returns an empty list and no last checked time before the response arrives", () => {
    fetchMock.get(LIST_URL, { advisories: [], last_checked_at: null });

    const { result } = renderHookWithProviders(
      () => useSecurityAdvisories(),
      {},
    );

    expect(result.current.data).toEqual([]);
    expect(result.current.lastCheckedAt).toBeNull();
  });
});
