import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupActionsEndpoints,
  setupBookmarksEndpoints,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { setupNotificationChannelsEndpoints } from "__support__/server-mocks/pulse";
import { mockSettings } from "__support__/settings";
import { createMockDashboardState } from "__support__/state";
import {
  act,
  mockGetBoundingClientRect,
  mockOffsetHeightAndWidth,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { setParameterValue } from "metabase/dashboard/actions/parameters";
import { DashboardClickAction } from "metabase/dashboard/click-behavior/DashboardClickAction";
import { getDashboardDrillUrl } from "metabase/dashboard/click-behavior/dashboard-click-drill";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { RouterProvider, navigate } from "metabase/router";
import Question from "metabase-lib/v1/Question";
import type { Dashboard, DashboardTabId } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardQueryMetadata,
  createMockDashboardTab,
  createMockParameter,
  createMockTextDashboardCard,
  createMockUser,
} from "metabase-types/api/mocks";

import { DashboardApp } from "./DashboardApp";

registerDashboardVisualizations();

function setup() {
  mockOffsetHeightAndWidth(1200);
  mockGetBoundingClientRect({ width: 1200, height: 800 });
  const source = createMockDashboard({
    id: 1,
    name: "Source",
    tabs: [
      createMockDashboardTab({ id: 11, name: "Source first" }),
      createMockDashboardTab({ id: 12, name: "Source second" }),
    ],
    parameters: [
      createMockParameter({
        id: "text-param",
        name: "Text filter",
        slug: "filter-text",
        type: "string/contains",
      }),
    ],
    dashcards: [
      createMockTextDashboardCard({
        dashboard_tab_id: 11,
        text: "Source card",
      }),
      createMockTextDashboardCard({
        id: 12,
        dashboard_tab_id: 12,
        text: "Same dashboard second card",
      }),
    ],
  });
  const destination = createMockDashboard({
    id: 2,
    name: "Destination",
    parameters: [],
    tabs: [
      createMockDashboardTab({ id: 21, dashboard_id: 2, name: "First tab" }),
      createMockDashboardTab({ id: 22, dashboard_id: 2, name: "Second tab" }),
    ],
    dashcards: [
      createMockTextDashboardCard({
        id: 21,
        dashboard_id: 2,
        dashboard_tab_id: 21,
        text: "First destination card",
      }),
      createMockTextDashboardCard({
        id: 22,
        dashboard_id: 2,
        dashboard_tab_id: 22,
        text: "Second destination card",
      }),
    ],
  });
  for (const dashboard of [source, destination]) {
    setupDashboardEndpoints(dashboard);
    setupDashboardQueryMetadataEndpoint(
      dashboard,
      createMockDashboardQueryMetadata(),
    );
  }
  setupNotificationChannelsEndpoints({});
  setupDatabasesEndpoints([]);
  setupCollectionsEndpoints({ collections: [] });
  setupBookmarksEndpoints([]);
  setupActionsEndpoints([]);
  window.history.replaceState({}, "", "/dashboard/1");

  const view = renderWithProviders(
    <RouterProvider
      routes={[{ path: "/dashboard/:slug", element: <DashboardApp /> }]}
    />,
    {
      storeInitialState: {
        currentUser: createMockUser(),
        dashboard: createMockDashboardState(),
        settings: mockSettings({ "site-url": window.location.origin }),
      },
    },
  );
  return { ...view, source, destination };
}

function getDestinationUrl({
  source,
  destination,
  tabId,
}: {
  source: Dashboard;
  destination: Dashboard;
  tabId: DashboardTabId;
}) {
  const column = createMockColumn({ name: "PRODUCT_ID" });
  return getDashboardDrillUrl({
    column,
    data: [{ col: column, value: 14 }],
    settings: {
      column: () => ({
        click_behavior: {
          type: "link",
          linkType: "dashboard",
          targetId: destination.id,
          tabId,
          parameterMapping: {},
        },
      }),
    },
    extraData: {
      dashboard: source,
      dashboards: { [destination.id]: destination },
      dashcard: createMockDashboardCard({
        card: createMockCard({ display: "table" }),
      }),
    },
  });
}

describe("DashboardApp navigation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("switches the visible tab and mapped filter when a click links to the same dashboard (metabase#39319)", async () => {
    const { store, source } = setup();
    expect(await screen.findByText("Source card")).toBeVisible();
    const column = createMockColumn({ name: "USER_ID" });
    const [action] = DashboardClickAction({
      question: new Question(createMockCard(), createMockMetadata()),
      clicked: {
        column,
        data: [{ col: column, value: 1 }],
        settings: {
          click_behavior: {
            type: "link",
            linkType: "dashboard",
            targetId: source.id,
            tabId: 12,
            parameterMapping: {
              "text-param": {
                id: "text-param",
                source: { type: "column", id: "USER_ID", name: "User ID" },
                target: { type: "parameter", id: "text-param" },
              },
            },
          },
        },
        extraData: {
          dashboard: source,
          dashboards: { [source.id]: source },
          parameters: source.parameters,
          setParameterValue,
        },
      },
    });
    if (!action || !("action" in action)) {
      throw new Error("Expected a same-dashboard click action");
    }
    act(() => store.dispatch(action.action()));
    expect(await screen.findByText("Same dashboard second card")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Source second" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() =>
      expect(window.location.search).toBe(
        "?filter-text=1&tab=12-source-second",
      ),
    );
  });

  it("opens the configured tab after Back and revisiting another destination tab (metabase#34447, metabase#44106)", async () => {
    const { source, destination } = setup();
    expect(await screen.findByText("Source card")).toBeVisible();
    act(() => navigate(getDestinationUrl({ source, destination, tabId: 22 })));
    expect(await screen.findByText("Second destination card")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Second tab" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() =>
      expect(window.location.search).toBe("?tab=22-second-tab"),
    );
    await userEvent.click(screen.getByRole("tab", { name: "Second tab" }));

    act(() => window.history.back());
    expect(await screen.findByDisplayValue("Source")).toBeVisible();
    expect(window.location.pathname).toBe("/dashboard/1");

    act(() => navigate(getDestinationUrl({ source, destination, tabId: 21 })));
    expect(await screen.findByText("First destination card")).toBeVisible();
    expect(screen.getByRole("tab", { name: "First tab" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByText("Second destination card"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(window.location.search).toBe("?tab=21-first-tab"),
    );
  });
});
