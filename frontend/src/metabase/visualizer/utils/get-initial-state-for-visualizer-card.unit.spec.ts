import registerVisualizations from "metabase/visualizations/register";
import type { VisualizerVizDefinition } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockVisualizerDashboardCard,
} from "metabase-types/api/mocks";

import { getInitialStateForVisualizerCard } from "./get-initial-state-for-visualizer-card";

registerVisualizations();

describe("getInitialStateForVisualizerCard", () => {
  const mainCard = createMockCard({
    id: 1,
    name: "Main card",
    display: "line",
  });

  const seriesCard = createMockCard({
    id: 2,
    name: "Series card",
    display: "line",
  });

  const mainDataset = createMockDataset({
    data: createMockDatasetData({
      rows: [["Gadget", 10]],
      cols: [
        createMockColumn({ name: "Category" }),
        createMockColumn({ name: "Count" }),
      ],
    }),
  });

  const seriesDataset = createMockDataset({
    data: createMockDatasetData({
      rows: [["2024-01-01", 5]],
      cols: [
        createMockColumn({ name: "Date" }),
        createMockColumn({ name: "Revenue" }),
      ],
    }),
  });

  const visualizationEntity: VisualizerVizDefinition = {
    display: "line",
    columnValuesMapping: {
      COLUMN_1: [
        {
          name: "COLUMN_1",
          originalName: "Category",
          sourceId: `card:${mainCard.id}`,
        },
      ],
      COLUMN_2: [
        {
          name: "COLUMN_2",
          originalName: "Count",
          sourceId: `card:${mainCard.id}`,
        },
      ],
    },
    settings: {
      "graph.dimensions": ["COLUMN_1"],
      "graph.metrics": ["COLUMN_2"],
    },
  };

  it("should include preloadedDatasets from dashcard data", () => {
    const dashcard = createMockVisualizerDashboardCard({
      card: mainCard,
      visualization_settings: {
        visualization: visualizationEntity,
      },
    });

    const preloadedDatasets = {
      [mainCard.id]: mainDataset,
    };

    const initialState = getInitialStateForVisualizerCard(
      dashcard,
      preloadedDatasets,
    );

    expect(initialState.preloadedDatasets).toEqual(preloadedDatasets);
    expect(initialState.display).toBe("line");
    expect(initialState.columnValuesMapping).toEqual(
      visualizationEntity.columnValuesMapping,
    );
    expect(initialState.columns).toHaveLength(2);
  });

  it("should include preloadedDatasets for main card and series cards", () => {
    const dashcard = createMockVisualizerDashboardCard({
      card: mainCard,
      series: [seriesCard],
      visualization_settings: {
        visualization: visualizationEntity,
      },
    });

    const preloadedDatasets = {
      [mainCard.id]: mainDataset,
      [seriesCard.id]: seriesDataset,
    };

    const initialState = getInitialStateForVisualizerCard(
      dashcard,
      preloadedDatasets,
    );

    expect(initialState.preloadedDatasets).toEqual(preloadedDatasets);
  });
});
