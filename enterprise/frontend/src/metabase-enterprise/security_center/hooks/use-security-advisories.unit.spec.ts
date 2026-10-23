import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { findRequests } from "__support__/server-mocks";
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

  it("acknowledges one advisory through the hook", async () => {
    const advisory = createAdvisory({ advisory_id: "SA-001" });
    fetchMock.get(LIST_URL, { advisories: [advisory], last_checked_at: null });
    fetchMock.post("path:/api/ee/security-center/SA-001/acknowledge", advisory);

    const { result } = renderHookWithProviders(
      () => useSecurityAdvisories(),
      {},
    );

    await act(async () => {
      await result.current.acknowledgeAdvisory("SA-001").unwrap();
    });

    const posts = await findRequests("POST");
    expect(posts.map((post) => post.url)).toEqual([
      expect.stringContaining("/api/ee/security-center/SA-001/acknowledge"),
    ]);
  });

  it("acknowledges advisories in bulk through the hook", async () => {
    fetchMock.get(LIST_URL, { advisories: [], last_checked_at: null });
    fetchMock.post("path:/api/ee/security-center/acknowledge", []);

    const { result } = renderHookWithProviders(
      () => useSecurityAdvisories(),
      {},
    );

    await act(async () => {
      await result.current.acknowledgeAdvisories(["SA-002", "SA-003"]).unwrap();
    });

    const posts = await findRequests("POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toContain("/api/ee/security-center/acknowledge");
    expect(posts[0].body).toEqual({ advisory_ids: ["SA-002", "SA-003"] });
  });
});
