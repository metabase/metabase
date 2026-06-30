import { renderHook, waitFor } from "@testing-library/react";

import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import { createMockCard, createMockCollection } from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { useCollectionChartPaste } from "./use-collection-chart-paste";

const mockCreateCard = jest.fn();
const mockDispatch = jest.fn();

jest.mock("metabase/api", () => ({
  Api: {
    util: { invalidateTags: (tags: unknown) => ({ type: "INVALIDATE", tags }) },
  },
  useCreateCardMutation: () => [mockCreateCard],
}));
jest.mock("metabase/redux", () => ({
  useDispatch: () => mockDispatch,
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

function setup({ canWrite = true }: { canWrite?: boolean } = {}) {
  mockCreateCard.mockReturnValue({
    unwrap: () => Promise.resolve(createMockCard({ id: 5 })),
  });
  const collection = createMockCollection({
    id: 10,
    name: "My Collection",
    can_write: canWrite,
  });
  renderHook(() => useCollectionChartPaste(collection));
}

describe("useCollectionChartPaste", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a card in the collection from a pasted chart", async () => {
    setup({ canWrite: true });

    pasteText(chartText);

    await waitFor(() => {
      expect(mockCreateCard).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Orders by month",
        display: "bar",
        dataset_query: datasetQuery,
        collection_id: 10,
      }),
    );
  });

  it("does nothing in a read-only collection", () => {
    setup({ canWrite: false });
    pasteText(chartText);
    expect(mockCreateCard).not.toHaveBeenCalled();
  });

  it("ignores pastes that are not charts", () => {
    setup({ canWrite: true });
    pasteText("just some text");
    expect(mockCreateCard).not.toHaveBeenCalled();
  });
});
