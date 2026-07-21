import { act } from "@testing-library/react";


import { renderHookWithProviders } from "__support__/ui";
import { isEmbedPreview } from "metabase/embedding/config";
import { selectTab } from "metabase/redux/dashboard";
import {
  createMockDashboardState,
  createMockSettingsState,
  createMockState,
  createMockStoreDashboard,
} from "metabase/redux/store/mocks";
import type { Location } from "metabase/router";
import { push, replace } from "metabase/router";
import type { ParameterValueOrArray } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import { useDashboardUrlQuery } from "./use-dashboard-url-query";

// Pins the dashboard URL-query sync seam: how dashboard parameter and tab state
// gets pushed or replaced into the location query string, plus the router.listen
// tab subscription. The react-router migration re-plumbs both of these, and
// router.listen has no direct v7 equivalent, so this locks current behavior.

jest.mock("metabase/router", () => ({
  ...jest.requireActual("metabase/router"),
  push: jest.fn((descriptor) => ({ type: "MOCK_PUSH", payload: descriptor })),
  replace: jest.fn((descriptor) => ({
    type: "MOCK_REPLACE",
    payload: descriptor,
  })),
}));

jest.mock("metabase/embedding/config", () => ({
  ...jest.requireActual("metabase/embedding/config"),
  isEmbedPreview: jest.fn(() => false),
}));

const DASHBOARD_ID = 1;

type SetupOptions = {
  dashboardId?: number | null;
  parameters?: ReturnType<typeof createMockParameter>[];
  parameterValues?: Record<string, ParameterValueOrArray | null | undefined>;
  tabs?: { id: number; name: string }[];
  selectedTabId?: number | null;
  pathname?: string;
  query?: Record<string, unknown>;
};

function setup({
  dashboardId = DASHBOARD_ID,
  parameters = [],
  parameterValues = {},
  tabs,
  selectedTabId = null,
  pathname = `/dashboard/${DASHBOARD_ID}`,
  query = {},
}: SetupOptions = {}) {
  const listeners: ((location: Location) => void)[] = [];
  const unsubscribe = jest.fn();
  const router = {
    listen: jest.fn((cb: (location: Location) => void) => {
      listeners.push(cb);
      return unsubscribe;
    }),
  };

  // Unjustified type cast. FIXME
  const location = {
    pathname,
    query,
    search: "",
    hash: "",
    state: null,
  } as unknown as Location;

  const dashboards =
    dashboardId == null
      ? {}
      : {
          [dashboardId]: createMockStoreDashboard({
            id: dashboardId,
            parameters,
            // Unjustified type cast. FIXME
            tabs: tabs?.map((tab) => ({ ...tab }) as any),
          }),
        };

  const storeInitialState = createMockState({
    dashboard: createMockDashboardState({
      dashboardId,
      dashboards,
      parameterValues,
      selectedTabId,
    }),
    settings: createMockSettingsState({ "site-url": "" }),
  });

  const { store, unmount } = renderHookWithProviders(
    // Unjustified type cast. FIXME
    () => useDashboardUrlQuery(router as any, location),
    { storeInitialState },
  );

  return { store, unmount, router, listeners, unsubscribe, location };
}

describe("useDashboardUrlQuery", () => {
  beforeEach(() => {
    // Unjustified type cast. FIXME
    (push as jest.Mock).mockClear();
    // Unjustified type cast. FIXME
    (replace as jest.Mock).mockClear();
    // Unjustified type cast. FIXME
    (isEmbedPreview as jest.Mock).mockReturnValue(false);
  });

  it("syncs a parameter-value change with replace (not push), writing the parameter slug values into the query", () => {
    setup({
      parameters: [createMockParameter({ id: "1", slug: "text" })],
      parameterValues: { "1": "bar" },
    });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ text: "bar" }),
      }),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("syncs a tab change with push (not replace), writing the new tab slug into the query", () => {
    const { store } = setup({
      tabs: [
        { id: 1, name: "Tab 1" },
        { id: 2, name: "Tab 2" },
      ],
      selectedTabId: 1,
    });

    // The mount sync (previous query params were undefined) uses replace.
    (push as jest.Mock).mockClear();
    // Unjustified type cast. FIXME
    (replace as jest.Mock).mockClear();

    act(() => {
      store.dispatch(selectTab({ tabId: 2 }));
    });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ tab: "2-tab-2" }),
      }),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not sync when isEmbedPreview() is true", () => {
    // Unjustified type cast. FIXME
    (isEmbedPreview as jest.Mock).mockReturnValue(true);

    setup({
      parameters: [createMockParameter({ id: "1", slug: "text" })],
      parameterValues: { "1": "bar" },
    });

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not sync when there is no dashboardId", () => {
    setup({
      dashboardId: null,
      parameters: [createMockParameter({ id: "1", slug: "text" })],
      parameterValues: { "1": "bar" },
    });

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  describe("router.listen tab subscription", () => {
    it("selects the tab when a same-pathname navigation changes the tab query id", () => {
      const { store, listeners, location } = setup();

      expect(store.getState().dashboard.selectedTabId).toBe(null);

      act(() => {
        listeners[0]({
          ...location,
          query: { tab: "5-tab-5" },
        });
      });

      // selectTab is the only reducer that sets selectedTabId, so this pins that
      // selectTab({ tabId: 5 }) was dispatched by the subscription.
      expect(store.getState().dashboard.selectedTabId).toBe(5);
    });

    it("does nothing when the pathname changes", () => {
      const { store, listeners, location } = setup();

      act(() => {
        listeners[0]({
          ...location,
          pathname: "/dashboard/999",
          query: { tab: "5-tab-5" },
        });
      });

      expect(store.getState().dashboard.selectedTabId).toBe(null);
    });

    it("unsubscribes on unmount", () => {
      const { unmount, unsubscribe } = setup();

      expect(unsubscribe).not.toHaveBeenCalled();
      unmount();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  it("does not sync while navigation is in progress (URL dashboard id differs from current)", () => {
    setup({
      dashboardId: DASHBOARD_ID,
      parameters: [createMockParameter({ id: "1", slug: "text" })],
      parameterValues: { "1": "bar" },
      pathname: "/dashboard/999",
    });

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("preserves an allow-listed query param (objectId) when syncing", () => {
    setup({
      parameters: [createMockParameter({ id: "1", slug: "text" })],
      parameterValues: { "1": "bar" },
      query: { objectId: "42" },
    });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ objectId: "42", text: "bar" }),
      }),
    );
  });
});
