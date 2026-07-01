import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { renderWithProviders, waitFor } from "__support__/ui";
import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import { createMockCard } from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { useDashboardChartPaste } from "./use-dashboard-chart-paste";

// `useDashboardContext` needs a fully-loaded dashboard and `addCardToDashboard`
// fans out to card/data/metadata fetches; both are their own tested concerns, so
// only those two are stubbed. The store, createCard request, and undo toast run
// for real.
const mockAddCardToDashboard = jest.fn((_opts: unknown) => () =>
  Promise.resolve(),
);
const mockUseDashboardContext = jest.fn();

jest.mock("metabase/dashboard/context", () => ({
  ...jest.requireActual("metabase/dashboard/context"),
  useDashboardContext: () => mockUseDashboardContext(),
}));
jest.mock("metabase/dashboard/actions", () => ({
  ...jest.requireActual("metabase/dashboard/actions"),
  addCardToDashboard: (opts: unknown) => mockAddCardToDashboard(opts),
}));

const datasetQuery = createMockStructuredDatasetQuery();

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
  mockUseDashboardContext.mockReturnValue({
    dashboard: { id: 7 },
    isEditing,
    selectedTabId,
  });
  renderWithProviders(<TestComponent />);
}

function paste(text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: () => text },
  });
  window.dispatchEvent(event);
}

describe("useDashboardChartPaste", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a dashboard card from a pasted chart while editing", async () => {
    fetchMock.post("path:/api/card", createMockCard({ id: 99 }), {
      name: "create-card",
      matchPartialBody: true,
      body: { display: "bar", dashboard_id: 7, dataset_query: datasetQuery },
    });

    setup({ isEditing: true, selectedTabId: 3 });
    act(() => {
      paste(chartText);
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.called("create-card")).toBe(true);
    });
    await waitFor(() => {
      expect(mockAddCardToDashboard).toHaveBeenCalledWith(
        expect.objectContaining({ dashId: 7, tabId: 3, cardId: 99 }),
      );
    });
  });

  it("does nothing when not editing", async () => {
    fetchMock.post("path:/api/card", createMockCard({ id: 99 }));

    setup({ isEditing: false });
    paste(chartText);

    await Promise.resolve();
    expect(fetchMock.callHistory.called("path:/api/card")).toBe(false);
  });

  it("ignores pastes that are not charts", async () => {
    fetchMock.post("path:/api/card", createMockCard({ id: 99 }));

    setup({ isEditing: true });
    paste("just some text");

    await Promise.resolve();
    expect(fetchMock.callHistory.called("path:/api/card")).toBe(false);
  });
});
