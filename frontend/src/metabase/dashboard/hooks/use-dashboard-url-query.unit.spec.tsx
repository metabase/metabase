import { act } from "@testing-library/react";

import {
  createMockDashboardState,
  createMockSettingsState,
  createMockState,
  createMockStoreDashboard,
} from "__support__/state";
import { renderHookWithProviders } from "__support__/ui";
import { isEmbedPreview } from "metabase/embedding/config";
import { selectTab } from "metabase/redux/dashboard";
import type { Location } from "metabase/router";
import { notifyLocationListeners, useIsNavigationHeld } from "metabase/router";
import type { ParameterValueOrArray } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import { useDashboardUrlQuery } from "./use-dashboard-url-query";

// Pins the dashboard URL-query sync seam: how dashboard parameter and tab state
// is written into the location query string, and whether it replaces the entry
// or adds one, plus the location subscription that selects a tab.

const navigateMock = jest.fn();

jest.mock("metabase/router", () => ({
  ...jest.requireActual("metabase/router"),
  useNavigate: () => navigateMock,
  useIsNavigationHeld: jest.fn(() => false),
}));

const replacedWith = (search: string) => [
  expect.objectContaining({ search }),
  expect.objectContaining({ replace: true }),
];

const pushedWith = (search: string) => [
  expect.objectContaining({ search }),
  expect.objectContaining({ replace: false }),
];

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
  search?: string;
};

function setup({
  dashboardId = DASHBOARD_ID,
  parameters = [],
  parameterValues = {},
  tabs,
  selectedTabId = null,
  pathname = `/dashboard/${DASHBOARD_ID}`,
  search = "",
}: SetupOptions = {}) {
  // Cast because the test only drives the URL parts the hook reads; `key` is
  // supplied by the router at runtime and nothing here depends on it.
  const location = {
    pathname,
    search,
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

  const { store, unmount, rerender } = renderHookWithProviders(
    () => useDashboardUrlQuery(location),
    { storeInitialState },
  );

  return { store, unmount, rerender, location };
}

describe("useDashboardUrlQuery", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    // Unjustified type cast. FIXME
    (isEmbedPreview as jest.Mock).mockReturnValue(false);
    // Unjustified type cast. FIXME
    (useIsNavigationHeld as jest.Mock).mockReturnValue(false);
  });

  // The router keeps one pending navigation. Syncing the URL while a leave
  // prompt is up would replace the destination the user is being asked about,
  // and confirming would then take them somewhere they never agreed to
  // (metabase#53132).
  describe("while a leave prompt holds a navigation", () => {
    it("does not sync the query string", () => {
      // Unjustified type cast. FIXME
      (useIsNavigationHeld as jest.Mock).mockReturnValue(true);

      setup({
        parameters: [createMockParameter({ id: "1", slug: "text" })],
        parameterValues: { "1": "bar" },
      });

      expect(navigateMock).not.toHaveBeenCalled();
    });

    it("syncs once the prompt is answered", () => {
      // Unjustified type cast. FIXME
      (useIsNavigationHeld as jest.Mock).mockReturnValue(true);

      const { rerender } = setup({
        parameters: [createMockParameter({ id: "1", slug: "text" })],
        parameterValues: { "1": "bar" },
      });
      expect(navigateMock).not.toHaveBeenCalled();

      // Unjustified type cast. FIXME
      (useIsNavigationHeld as jest.Mock).mockReturnValue(false);
      rerender();

      expect(navigateMock).toHaveBeenCalledWith(...replacedWith("?text=bar"));
    });
  });

  it("syncs a parameter-value change by replacing the entry, writing the parameter slug values into the search string", () => {
    setup({
      parameters: [createMockParameter({ id: "1", slug: "text" })],
      parameterValues: { "1": "bar" },
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(...replacedWith("?text=bar"));
  });

  it("syncs a tab change by adding a history entry, writing the new tab slug into the search string", () => {
    const { store } = setup({
      tabs: [
        { id: 1, name: "Tab 1" },
        { id: 2, name: "Tab 2" },
      ],
      selectedTabId: 1,
    });

    // The mount sync (previous query params were undefined) replaces.
    navigateMock.mockClear();

    act(() => {
      store.dispatch(selectTab({ tabId: 2 }));
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(...pushedWith("?tab=2-tab-2"));
  });

  it("does not sync when isEmbedPreview() is true", () => {
    // Unjustified type cast. FIXME
    (isEmbedPreview as jest.Mock).mockReturnValue(true);

    setup({
      parameters: [createMockParameter({ id: "1", slug: "text" })],
      parameterValues: { "1": "bar" },
    });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does not sync when there is no dashboardId", () => {
    setup({
      dashboardId: null,
      parameters: [createMockParameter({ id: "1", slug: "text" })],
      parameterValues: { "1": "bar" },
    });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  describe("location tab subscription", () => {
    it("selects the tab when a same-pathname navigation changes the tab query id", () => {
      const { store, location } = setup();

      expect(store.getState().dashboard.selectedTabId).toBe(null);

      act(() => {
        notifyLocationListeners({ ...location, search: "?tab=5-tab-5" });
      });

      // selectTab is the only reducer that sets selectedTabId, so this pins that
      // selectTab({ tabId: 5 }) was dispatched by the subscription.
      expect(store.getState().dashboard.selectedTabId).toBe(5);
    });

    it("does nothing when the pathname changes", () => {
      const { store, location } = setup();

      act(() => {
        notifyLocationListeners({
          ...location,
          pathname: "/dashboard/999",
          search: "?tab=5-tab-5",
        });
      });

      expect(store.getState().dashboard.selectedTabId).toBe(null);
    });

    it("stops listening on unmount", () => {
      const { store, unmount, location } = setup();

      unmount();

      act(() => {
        notifyLocationListeners({ ...location, search: "?tab=5-tab-5" });
      });

      expect(store.getState().dashboard.selectedTabId).toBe(null);
    });
  });

  it("does not sync while navigation is in progress (URL dashboard id differs from current)", () => {
    setup({
      dashboardId: DASHBOARD_ID,
      parameters: [createMockParameter({ id: "1", slug: "text" })],
      parameterValues: { "1": "bar" },
      pathname: "/dashboard/999",
    });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("preserves an allow-listed query param (objectId) when syncing", () => {
    setup({
      parameters: [createMockParameter({ id: "1", slug: "text" })],
      parameterValues: { "1": "bar" },
      search: "?objectId=42",
    });

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(
      // sorted, as `queryToSearch` writes it
      ...replacedWith("?objectId=42&text=bar"),
    );
  });
});
