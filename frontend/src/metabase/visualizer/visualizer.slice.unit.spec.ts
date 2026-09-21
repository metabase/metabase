import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
} from "__support__/server-mocks";
import { Api } from "metabase/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  initializeVisualizer,
  reducer as visualizerReducer,
} from "./visualizer.slice";

function setup() {
  return getStore(
    {
      [Api.reducerPath]: Api.reducer,
      visualizer: visualizerReducer,
    },
    {},
    [Api.middleware],
  );
}

describe("visualizer slice", () => {
  describe("initializeVisualizer", () => {
    it("should use preloaded dashboard datasets instead of refetching unfiltered card queries", async () => {
      const card = createMockCard({
        id: 1,
        name: "Filtered card",
        display: "table",
      });

      const filteredDataset = createMockDataset({
        data: createMockDatasetData({
          rows: [["Gadget", 10]],
          cols: [
            createMockColumn({ name: "Category" }),
            createMockColumn({ name: "Count" }),
          ],
        }),
      });

      const unfilteredDataset = createMockDataset({
        data: createMockDatasetData({
          rows: [
            ["Doohickey", 5],
            ["Gadget", 10],
          ],
          cols: [
            createMockColumn({ name: "Category" }),
            createMockColumn({ name: "Count" }),
          ],
        }),
      });

      setupCardEndpoints(card);
      setupCardQueryEndpoints(card, unfilteredDataset);

      const store = setup();

      await store.dispatch(
        initializeVisualizer({
          state: {
            display: "table",
            columns: [],
            columnValuesMapping: {
              COLUMN_1: [
                {
                  name: "COLUMN_1",
                  originalName: "Category",
                  sourceId: "card:1",
                },
              ],
            },
            settings: {},
            preloadedDatasets: {
              [card.id]: filteredDataset,
            },
          },
        }),
      );

      expect(
        store.getState().visualizer.present.datasets["card:1"].data.rows,
      ).toEqual(filteredDataset.data.rows);

      expect(
        fetchMock.callHistory.called(`path:/api/card/${card.id}/query`),
      ).toBe(false);
    });
  });
});
