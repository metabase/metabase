import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, waitFor } from "__support__/ui";
import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import { getDashcards } from "metabase/dashboard/selectors";
import { createMockDashboardState } from "metabase/redux/store/mocks";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDashboard,
  createMockDataset,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { useDashboardChartPaste } from "./use-dashboard-chart-paste";

const TEST_DB = createSampleDatabase();
const datasetQuery = createMockStructuredDatasetQuery();

const CREATED_CARD = createMockCard({
  id: 99,
  display: "bar",
  dataset_query: datasetQuery,
});

const chartText = serializeChartClipboard(
  {
    name: "Orders by month",
    display: "bar",
    dataset_query: datasetQuery,
    visualization_settings: {},
  },
  "https://metabase.example",
);

function TestComponent() {
  useDashboardChartPaste();
  return null;
}

function setup({
  isEditing = true,
  selectedTabId = null,
}: { isEditing?: boolean; selectedTabId?: number | null } = {}) {
  const dashboard = createMockDashboard({ id: 7 });
  const dashboardState = createMockDashboardState({
    dashboardId: dashboard.id,
    dashboards: {
      [dashboard.id]: { ...dashboard, dashcards: [] },
    },
    editingDashboard: dashboard,
    dashcards: {},
  });

  const { store } = renderWithProviders(
    <MockDashboardContext
      dashboard={dashboard}
      isEditing={isEditing}
      selectedTabId={selectedTabId}
    >
      <TestComponent />
    </MockDashboardContext>,
    { storeInitialState: { dashboard: dashboardState } },
  );

  return { store };
}

function paste(text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: () => text },
  });
  window.dispatchEvent(event);
}

function setupCardMocks(card: Card) {
  setupDatabasesEndpoints([TEST_DB]);
  setupCardEndpoints(card);
  setupCardQueryEndpoints(card, createMockDataset());
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [TEST_DB] }),
  );
}

describe("useDashboardChartPaste", () => {
  it("creates a dashboard card from a pasted chart while editing", async () => {
    setupCardMocks(CREATED_CARD);
    fetchMock.post("path:/api/card", CREATED_CARD, {
      name: "create-card",
      matchPartialBody: true,
      body: {
        display: "bar",
        dashboard_id: 7,
        dashboard_tab_id: 3,
        dataset_query: datasetQuery,
      },
    });

    const { store } = setup({ isEditing: true, selectedTabId: 3 });
    act(() => {
      paste(chartText);
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.called("create-card")).toBe(true);
    });
    await waitFor(() => {
      const dashcards = Object.values(getDashcards(store.getState()));
      expect(dashcards).toContainEqual(
        expect.objectContaining({ card_id: 99, dashboard_tab_id: 3 }),
      );
    });
  });

  it("shows an in-progress toast and ignores repeated pastes while saving", async () => {
    setupCardMocks(CREATED_CARD);
    fetchMock.post("path:/api/card", CREATED_CARD, {
      name: "create-card",
      delay: 100,
    });

    const { store } = setup({ isEditing: true });
    act(() => {
      paste(chartText);
      paste(chartText);
    });

    await waitFor(() => {
      expect(store.getState().undo).toContainEqual(
        expect.objectContaining({ message: "Adding chart to dashboard…" }),
      );
    });

    await waitFor(() => {
      expect(store.getState().undo).toContainEqual(
        expect.objectContaining({ message: "Chart added to dashboard" }),
      );
    });
    expect(fetchMock.callHistory.calls("create-card")).toHaveLength(1);
  });

  it("does nothing when not editing", () => {
    fetchMock.post("path:/api/card", CREATED_CARD);

    setup({ isEditing: false });
    paste(chartText);

    expect(fetchMock.callHistory.called("path:/api/card")).toBe(false);
  });

  it("ignores pastes that are not charts", () => {
    fetchMock.post("path:/api/card", CREATED_CARD);

    setup({ isEditing: true });
    paste("just some text");

    expect(fetchMock.callHistory.called("path:/api/card")).toBe(false);
  });
});
