import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { SingleSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { getCardsReferencedColumns } from "./index";

describe("getCardsReferencedColumns", () => {
  const dimensionA = createMockColumn({
    name: "created_at",
    base_type: "type/DateTime",
    source: "breakout",
  });
  const metricA = createMockColumn({
    name: "count",
    base_type: "type/Integer",
    source: "aggregation",
  });
  const extraA = createMockColumn({ name: "extra_a" });
  const dimensionB = createMockColumn({
    name: "category",
    base_type: "type/Text",
    source: "breakout",
  });
  const metricB = createMockColumn({
    name: "sum",
    base_type: "type/Integer",
    source: "aggregation",
  });
  const extraB = createMockColumn({ name: "extra_b" });

  const cardA: SingleSeries = {
    card: createMockCard({
      id: 1,
      visualization_settings: {
        "graph.dimensions": ["created_at"],
        "graph.metrics": ["count"],
      },
    }),
    data: createMockDatasetData({
      cols: [dimensionA, metricA, extraA],
      rows: [["2024", 1, "x"]],
    }),
  };
  const cardB: SingleSeries = {
    card: createMockCard({
      id: 2,
      visualization_settings: {
        "graph.dimensions": ["category"],
        "graph.metrics": ["sum"],
      },
    }),
    data: createMockDatasetData({
      cols: [dimensionB, metricB, extraB],
      rows: [["a", 2, "y"]],
    }),
  };

  it("uses the passed-in settings for a single-card series", () => {
    const settings: ComputedVisualizationSettings = {
      "graph.dimensions": ["created_at"],
      "graph.metrics": ["count"],
    };
    expect(getCardsReferencedColumns([cardA], settings)).toEqual([
      [dimensionA, metricA],
    ]);
  });

  it("uses each card's own visualization_settings when multiple cards are combined", () => {
    // Computed settings only reflect the first card, but each card needs to
    // resolve against its own stored settings so referenced columns are
    // correct per card.
    const computedSettings: ComputedVisualizationSettings = {
      "graph.dimensions": ["created_at"],
      "graph.metrics": ["count"],
    };
    expect(getCardsReferencedColumns([cardA, cardB], computedSettings)).toEqual(
      [
        [dimensionA, metricA],
        [dimensionB, metricB],
      ],
    );
  });
});
