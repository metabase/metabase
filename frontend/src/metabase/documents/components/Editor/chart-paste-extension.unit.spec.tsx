import { renderWithProviders } from "__support__/ui";
import { serializeChartClipboard } from "metabase/common/utils/chart-clipboard";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { materializePastedChart } from "./chart-paste-extension";

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

describe("materializePastedChart", () => {
  it("registers a draft card and returns a cardEmbed node for a pasted chart", () => {
    const { store } = renderWithProviders(<div />);

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
    const { store } = renderWithProviders(<div />);

    expect(materializePastedChart("just some text", store.dispatch)).toBeNull();
    expect(materializePastedChart(undefined, store.dispatch)).toBeNull();
    expect(Object.keys(store.getState().documents.draftCards)).toHaveLength(0);
  });
});
