import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { renderWithProviders, waitFor } from "__support__/ui";
import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import type { Collection } from "metabase-types/api";
import { createMockCard, createMockCollection } from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { useCollectionChartPaste } from "./use-collection-chart-paste";

const datasetQuery = createMockStructuredDatasetQuery();

const chartText = serializeChartClipboard(
  {
    name: "Orders by month",
    display: "bar",
    dataset_query: datasetQuery,
    visualization_settings: {},
    chart_id: "chart-1",
    query_id: "query-1",
  },
  "https://metabase.example",
);

function TestComponent({ collection }: { collection: Collection }) {
  useCollectionChartPaste(collection);
  return null;
}

function setup({ canWrite = true }: { canWrite?: boolean } = {}) {
  const collection = createMockCollection({
    id: 10,
    name: "My Collection",
    can_write: canWrite,
  });
  return renderWithProviders(<TestComponent collection={collection} />);
}

function paste(text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: () => text },
  });
  window.dispatchEvent(event);
}

describe("useCollectionChartPaste", () => {
  it("creates a card in the collection from a pasted chart", async () => {
    fetchMock.post("path:/api/card", createMockCard({ id: 5 }), {
      name: "create-card",
      matchPartialBody: true,
      body: { display: "bar", collection_id: 10, dataset_query: datasetQuery },
    });

    setup({ canWrite: true });
    act(() => {
      paste(chartText);
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.called("create-card")).toBe(true);
    });
  });

  it("shows an in-progress toast and ignores repeated pastes while saving", async () => {
    fetchMock.post("path:/api/card", createMockCard({ id: 5 }), {
      name: "create-card",
      delay: 100,
    });

    const { store } = setup({ canWrite: true });
    act(() => {
      paste(chartText);
      paste(chartText);
    });

    await waitFor(() => {
      expect(store.getState().undo).toContainEqual(
        expect.objectContaining({ message: "Saving chart to My Collection…" }),
      );
    });

    await waitFor(() => {
      expect(store.getState().undo).toContainEqual(
        expect.objectContaining({ message: "Chart saved to My Collection" }),
      );
    });
    expect(fetchMock.callHistory.calls("create-card")).toHaveLength(1);
  });

  it("does nothing in a read-only collection", () => {
    fetchMock.post("path:/api/card", createMockCard({ id: 5 }));

    setup({ canWrite: false });
    paste(chartText);

    expect(fetchMock.callHistory.called("path:/api/card")).toBe(false);
  });

  it("ignores pastes that are not charts", () => {
    fetchMock.post("path:/api/card", createMockCard({ id: 5 }));

    setup({ canWrite: true });
    paste("just some text");

    expect(fetchMock.callHistory.called("path:/api/card")).toBe(false);
  });
});
