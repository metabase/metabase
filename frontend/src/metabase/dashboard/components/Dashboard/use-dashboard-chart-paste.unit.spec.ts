import { renderHook, waitFor } from "@testing-library/react";

import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import { createMockCard } from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { useDashboardChartPaste } from "./use-dashboard-chart-paste";

const mockCreateCard = jest.fn();
const mockDispatch = jest.fn();
const mockAddCardToDashboard = jest.fn((_opts: unknown) => ({
  type: "ADD_CARD",
}));
const mockUseDashboardContext = jest.fn();

jest.mock("metabase/api", () => ({
  useCreateCardMutation: () => [mockCreateCard],
}));
jest.mock("metabase/redux", () => ({
  useDispatch: () => mockDispatch,
}));
jest.mock("metabase/dashboard/context", () => ({
  useDashboardContext: () => mockUseDashboardContext(),
}));
jest.mock("metabase/dashboard/actions", () => ({
  addCardToDashboard: (opts: unknown) => mockAddCardToDashboard(opts),
}));
jest.mock("metabase/redux/undo", () => ({
  addUndo: () => ({ type: "ADD_UNDO" }),
}));

const datasetQuery = createMockStructuredDatasetQuery();

const chartText = serializeChartClipboard({
  name: "Orders by month",
  display: "bar",
  dataset_query: datasetQuery,
  visualization_settings: {},
});

function pasteText(text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: () => text },
  });
  window.dispatchEvent(event);
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
  mockCreateCard.mockReturnValue({
    unwrap: () => Promise.resolve(createMockCard({ id: 99 })),
  });
  renderHook(() => useDashboardChartPaste());
}

describe("useDashboardChartPaste", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a dashboard card from a pasted chart while editing", async () => {
    setup({ isEditing: true, selectedTabId: 3 });

    pasteText(chartText);

    await waitFor(() => {
      expect(mockCreateCard).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Orders by month",
        display: "bar",
        dataset_query: datasetQuery,
        dashboard_id: 7,
      }),
    );
    await waitFor(() => {
      expect(mockAddCardToDashboard).toHaveBeenCalledWith(
        expect.objectContaining({ dashId: 7, tabId: 3, cardId: 99 }),
      );
    });
  });

  it("ignores pastes that are not charts", () => {
    setup({ isEditing: true });
    pasteText("just some text");
    expect(mockCreateCard).not.toHaveBeenCalled();
  });

  it("does nothing when not editing", () => {
    setup({ isEditing: false });
    pasteText(chartText);
    expect(mockCreateCard).not.toHaveBeenCalled();
  });
});
