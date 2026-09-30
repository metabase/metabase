import { createMockState, createMockVisualizerState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import { getInitialStateForCardDataSource } from "metabase/visualizer/utils/get-initial-state-for-card-data-source";
import { loadVisualizationComponents } from "metabase/viz-core";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { TabularPreviewModal } from "./TabularPreviewModal";

registerVisualizations();

beforeAll(() => loadVisualizationComponents(["table"]));

describe("TabularPreviewModal", () => {
  beforeAll(() => {
    mockGetBoundingClientRect();
  });

  it("should show the merged data of a three-column chart (metabase#69038)", () => {
    const card = createMockCard({
      id: 1,
      name: "Orders and products by month",
      display: "line",
      visualization_settings: {},
    });
    const dataset = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "CREATED_AT",
            display_name: "Created At",
            base_type: "type/DateTime",
            effective_type: "type/DateTime",
            unit: "month",
          }),
          createMockColumn({
            name: "count",
            display_name: "Count",
            base_type: "type/BigInteger",
            semantic_type: "type/Quantity",
          }),
          createMockColumn({
            name: "count_2",
            display_name: "Products count",
            base_type: "type/BigInteger",
            semantic_type: "type/Quantity",
          }),
        ],
        rows: [
          ["2024-01-01T00:00:00Z", 10, 20],
          ["2024-02-01T00:00:00Z", 30, 40],
        ],
      }),
    });

    const initialState = getInitialStateForCardDataSource(card, dataset);

    expect(() =>
      renderWithProviders(<TabularPreviewModal opened onClose={jest.fn()} />, {
        storeInitialState: createMockState({
          visualizer: {
            past: [],
            present: createMockVisualizerState({
              ...initialState,
              cards: [card],
              datasets: { "card:1": dataset },
            }),
            future: [],
          },
        }),
      }),
    ).not.toThrow();

    const modal = screen.getByTestId("visualizer-tabular-preview-modal");
    expect(
      within(modal)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Created At", "Count", "Products count"]);
  });
});
