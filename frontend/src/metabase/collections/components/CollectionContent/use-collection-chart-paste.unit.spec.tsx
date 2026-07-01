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
  renderWithProviders(<TestComponent collection={collection} />);
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
    // The route only matches when the POST body targets the collection with the
    // chart's query, so asserting it was called verifies the request payload.
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

  it("does nothing in a read-only collection", async () => {
    fetchMock.post("path:/api/card", createMockCard({ id: 5 }));

    setup({ canWrite: false });
    paste(chartText);

    await Promise.resolve();
    expect(fetchMock.callHistory.called("path:/api/card")).toBe(false);
  });

  it("ignores pastes that are not charts", async () => {
    fetchMock.post("path:/api/card", createMockCard({ id: 5 }));

    setup({ canWrite: true });
    paste("just some text");

    await Promise.resolve();
    expect(fetchMock.callHistory.called("path:/api/card")).toBe(false);
  });
});
