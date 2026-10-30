import { createMockVisualizerState } from "__support__/state/visualizer";
import { registerVisualizations } from "metabase/visualizations/register";
import type { DatasetColumn, RowValues } from "metabase-types/api";
import {
  createMockCard,
  createMockCategoryColumn,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { getIsRenderable } from "./selectors";
import { createDataSource } from "./utils";
import { getInitialStateForCardDataSource } from "./utils/get-initial-state-for-card-data-source";

registerVisualizations();

const categoryColumn = createMockCategoryColumn({ name: "CATEGORY" });
const countColumn = createMockNumericColumn({
  name: "count",
  source: "aggregation",
});
const vendorColumn = createMockCategoryColumn({ name: "VENDOR" });

type SetupOpts = {
  cols: DatasetColumn[];
  rows: RowValues[];
  noResultsMessage?: string;
};

function setup({ cols, rows, noResultsMessage }: SetupOpts) {
  const card = createMockCard({ id: 1, name: "Orders", display: "bar" });
  const dataset = createMockDataset({
    data: createMockDatasetData({
      cols,
      rows,
    }),
  });
  const { preloadedDatasets: _preloaded, ...initialState } =
    getInitialStateForCardDataSource(card, dataset);
  const { id: dataSourceId } = createDataSource("card", card.id, card.name);

  return {
    visualizer: {
      past: [],
      present: createMockVisualizerState({
        ...initialState,
        settings: {
          ...initialState.settings,
          "card.no_results_message": noResultsMessage,
        },
        initialState,
        cards: [card],
        datasets: { [dataSourceId]: dataset },
      }),
      future: [],
    },
  };
}

describe("getIsRenderable", () => {
  it("is renderable when the query returns rows", () => {
    expect(
      getIsRenderable(
        setup({ cols: [categoryColumn, countColumn], rows: [["Widget", 1]] }),
      ),
    ).toBe(true);
  });

  it("is not renderable when the query returns no rows and there is no no-results message", () => {
    expect(
      getIsRenderable(setup({ cols: [categoryColumn, countColumn], rows: [] })),
    ).toBe(false);
  });

  it("is renderable when the query returns no rows, the chart is configured, and there is a no-results message", () => {
    expect(
      getIsRenderable(
        setup({
          cols: [categoryColumn, countColumn],
          rows: [],
          noResultsMessage: "No orders yet",
        }),
      ),
    ).toBe(true);
  });

  it("is not renderable when the query returns no rows and the chart has no metric, even with a no-results message", () => {
    expect(
      getIsRenderable(
        setup({
          cols: [categoryColumn, vendorColumn],
          rows: [],
          noResultsMessage: "No orders yet",
        }),
      ),
    ).toBe(false);
  });

  it("is not renderable when the query returns rows and the chart has no metric", () => {
    expect(
      getIsRenderable(
        setup({
          cols: [categoryColumn, vendorColumn],
          rows: [["Widget", "Acme"]],
        }),
      ),
    ).toBe(false);
  });
});
