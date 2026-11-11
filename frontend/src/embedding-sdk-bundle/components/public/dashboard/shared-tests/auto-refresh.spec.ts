import fetchMock from "fetch-mock";

import { act, screen, waitFor } from "__support__/ui";
import type { Dashboard } from "metabase-types/api";

import type { SetupSdkDashboardOptions } from "../tests/setup";

type SetupOpts = Omit<SetupSdkDashboardOptions, "component">;

export function addEnterpriseAutoRefreshTests(
  setup: (options?: SetupOpts) => Promise<{ dashboard: Dashboard }>,
) {
  describe("autoRefreshInterval property", () => {
    const DASHBOARD_CARD_QUERY_REQUEST_COUNT = 1;

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should support auto-refreshing dashboards for positive integers", async () => {
      jest.useFakeTimers();

      await setup({ props: { autoRefreshInterval: 10 } });

      // Wait for initial dashboard load
      await waitForQueryRequests(1 * DASHBOARD_CARD_QUERY_REQUEST_COUNT);

      // Advance time by the auto-refresh interval (10 seconds)
      act(() => jest.advanceTimersByTime(10_000));

      // Wait for the auto-refresh request to be made
      await waitForQueryRequests(2 * DASHBOARD_CARD_QUERY_REQUEST_COUNT);

      // Advance time again to test multiple refresh cycles
      act(() => jest.advanceTimersByTime(10_000));

      await waitForQueryRequests(3 * DASHBOARD_CARD_QUERY_REQUEST_COUNT);
    });

    it("should show the auto-refresh indicator in the dashboard header for positive integers", async () => {
      await setup({ props: { autoRefreshInterval: 10 } });

      expect(
        screen.getByRole("button", { name: "Auto Refresh" }),
      ).toBeVisible();
    });

    describe.each([
      { name: "null", value: null },
      { name: "undefined", value: undefined },
      { name: "0", value: 0 },
      { name: "negative", value: -10 },
    ])("when interval is $name", ({ value }) => {
      it("should not auto-refresh", async () => {
        jest.useFakeTimers();

        // Forces the type, because users can literally pass any type here
        await setup({ props: { autoRefreshInterval: value as number } });

        // Wait for initial dashboard load
        await waitForQueryRequests(DASHBOARD_CARD_QUERY_REQUEST_COUNT);

        // Advance time significantly
        act(() => jest.advanceTimersByTime(30_000));

        // Verify no additional requests were made
        const finalRequests = getDashboardQueryRequests();
        expect(finalRequests.length).toBe(DASHBOARD_CARD_QUERY_REQUEST_COUNT);
      });

      it("should not show the auto-refresh indicator in the dashboard header", async () => {
        // Forces the type, because users can literally pass any type here
        await setup({ props: { autoRefreshInterval: value as number } });

        expect(
          screen.queryByRole("button", { name: "Auto Refresh" }),
        ).not.toBeInTheDocument();
      });
    });
  });
}

export const addPremiumAutoRefreshTests = addEnterpriseAutoRefreshTests;

const DASHBOARD_CARD_QUERY_URL =
  /^http:\/\/localhost\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query/;

// A waitFor with an async callback under fake timers resolves while its own
// last act() is still running, so the requests are counted synchronously and
// their responses land afterwards, inside act().
async function waitForQueryRequests(count: number) {
  await waitFor(() => {
    expect(getDashboardQueryRequests()).toHaveLength(count);
  });
  await act(() => fetchMock.callHistory.flush());
}

function getDashboardQueryRequests() {
  return fetchMock.callHistory
    .calls()
    .filter(
      (call) =>
        call.request?.method === "POST" &&
        DASHBOARD_CARD_QUERY_URL.test(call.url),
    );
}
