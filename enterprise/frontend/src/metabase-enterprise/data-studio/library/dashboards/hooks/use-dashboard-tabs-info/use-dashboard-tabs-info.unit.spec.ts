import { setupListSubscriptionsEndpoint } from "__support__/server-mocks/pulse";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { DashboardId } from "metabase-types/api";
import {
  createMockDashboardSubscription,
  createMockUser,
} from "metabase-types/api/mocks";

import { useDashboardTabsInfo } from "./use-dashboard-tabs-info";

describe("useDashboardTabsInfo", () => {
  it("doesn't show the previous dashboard's subscription count while the next one loads", async () => {
    setupListSubscriptionsEndpoint(
      [
        createMockDashboardSubscription({ id: 1, dashboard_id: 1 }),
        createMockDashboardSubscription({ id: 2, dashboard_id: 1 }),
      ],
      { dashboardId: 1 },
    );
    setupListSubscriptionsEndpoint(
      [createMockDashboardSubscription({ id: 3, dashboard_id: 2 })],
      { dashboardId: 2 },
    );
    const { result, rerender } = renderHookWithProviders(
      ({ dashboardId }: { dashboardId: DashboardId }) =>
        useDashboardTabsInfo(dashboardId),
      {
        initialProps: { dashboardId: 1 },
        storeInitialState: {
          currentUser: createMockUser({ is_superuser: true }),
        },
      },
    );
    await waitFor(() =>
      expect(result.current.tabsInfo.subscriptionCount).toBe(2),
    );

    rerender({ dashboardId: 2 });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.tabsInfo.subscriptionCount).toBeUndefined();
    await waitFor(() =>
      expect(result.current.tabsInfo.subscriptionCount).toBe(1),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it("is not loading when it doesn't count a non-admin's subscriptions", () => {
    const { result } = renderHookWithProviders(() => useDashboardTabsInfo(1), {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: false }),
      },
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.tabsInfo.subscriptionCount).toBeUndefined();
  });
});
