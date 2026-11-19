import { configureStore } from "@reduxjs/toolkit";

import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import { documentsReducer } from "metabase/documents/documents.slice";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { materializePastedChart } from "./chart-paste-extension";

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

function setup() {
  // Materialization writes document state; no editor or app UI is involved.
  return configureStore({ reducer: { documents: documentsReducer } });
}

describe("materializePastedChart", () => {
  it("registers a draft card and returns a cardEmbed node for a pasted chart", () => {
    const store = setup();

    const node = materializePastedChart(chartText, store.dispatch);
    const draftId = node?.content?.[0]?.attrs?.id;

    expect(draftId).toBeLessThan(0);
    expect(node).toEqual({
      type: "resizeNode",
      content: [{ type: "cardEmbed", attrs: { id: draftId } }],
    });
    expect(store.getState().documents.draftCards[draftId]).toEqual(
      expect.objectContaining({
        id: draftId,
        name: "Orders by month",
        display: "bar",
        dataset_query: datasetQuery,
        type: "question",
      }),
    );
  });

  it("returns null and registers no draft card for non-chart content", () => {
    const store = setup();

    expect(materializePastedChart("just some text", store.dispatch)).toBeNull();
    expect(materializePastedChart(undefined, store.dispatch)).toBeNull();
    expect(Object.keys(store.getState().documents.draftCards)).toHaveLength(0);
  });
});
