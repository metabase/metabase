import { waitFor } from "@testing-library/react";

import { findRequests } from "__support__/server-mocks";
import type { Dashboard } from "metabase-types/api";

import type { SetupSdkDashboardOptions } from "../tests/setup";

type SetupOpts = Omit<SetupSdkDashboardOptions, "component">;

export function addEnterpriseAutoRefreshTests(
  setup: (options?: SetupOpts) => Promise<{ dashboard: Dashboard }>,
) {
  describe("authRefreshInterval property", () => {
    const DASHBOARD_CARD_QUERY_REQUEST_COUNT = 1;

    it("should support auto-refreshing dashboards for positive integers", async () => {
      jest.useFakeTimers({ advanceTimers: true });

      try {
        await setup({ props: { autoRefreshInterval: 10 } });

        // Wait for initial dashboard load
        await waitFor(async () => {
          const initialRequests = await getDashboardQueryRequests();
          expect(initialRequests.length).toBe(
            1 * DASHBOARD_CARD_QUERY_REQUEST_COUNT,
          );
        });

        // Advance time by the auto-refresh interval (10 seconds)
        jest.advanceTimersByTime(10_000);

        // Wait for the auto-refresh request to be made
        await waitFor(async () => {
          const requestsAfterRefresh = await getDashboardQueryRequests();
          expect(requestsAfterRefresh.length).toBe(
            2 * DASHBOARD_CARD_QUERY_REQUEST_COUNT,
          );
        });

        // Advance time again to test multiple refresh cycles
        jest.advanceTimersByTime(10_000);

        await waitFor(async () => {
          const requestsAfterSecondRefresh = await getDashboardQueryRequests();
          expect(requestsAfterSecondRefresh.length).toBe(
            3 * DASHBOARD_CARD_QUERY_REQUEST_COUNT,
          );
        });
      } finally {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });

    it.each([
      { name: "null", value: null },
      { name: "undefined", value: undefined },
      { name: "0", value: 0 },
      { name: "negative", value: -10 },
    ])("should not auto-refresh when interval is $name", async ({ value }) => {
      jest.useFakeTimers();

      try {
        // Forces the type, because users can literally pass any type here
        await setup({ props: { autoRefreshInterval: value as number } });

        // Wait for initial dashboard load
        await waitFor(async () => {
          const initialRequests = await getDashboardQueryRequests();
          expect(initialRequests.length).toBe(
            DASHBOARD_CARD_QUERY_REQUEST_COUNT,
          );
        });

        // Advance time significantly
        jest.advanceTimersByTime(30_000);

        // Verify no additional requests were made
        const finalRequests = await getDashboardQueryRequests();
        expect(finalRequests.length).toBe(DASHBOARD_CARD_QUERY_REQUEST_COUNT);
      } finally {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });
  });
}

export const addPremiumAutoRefreshTests = addEnterpriseAutoRefreshTests;

async function getDashboardQueryRequests() {
  return findRequests("POST").then((requests) =>
    requests.filter((req) =>
      req.url.match(
        new RegExp(
          "^http://localhost/api/dashboard/\\d+/dashcard/\\d+/card/\\d+/query",
        ),
      ),
    ),
  );
}
