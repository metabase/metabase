import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";
import type { SingleSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { getChartLayout } from "../layout";
import { getCartesianChartModel } from "../model";

import { buildEChartsSeries } from "./series";

const chartWidth = 480;
const chartHeight = 274;
const hasTimelineEvents = false;
const hiddenSeries: string[] = [];

const mockRenderingContext: RenderingContext = {
  getColor: (name) => name,
  measureText: () => 0,
  measureTextHeight: () => 0,
  fontFamily: "",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const seriesFn = jest.fn();

const mockSettings = createMockVisualizationSettings({
  "graph.dimensions": ["Month created"],
  "graph.metrics": ["count"],
  series: seriesFn,
});

const mockSeries: SingleSeries = {
  card: createMockCard(),
  data: createMockDatasetData({
    rows: [
      [1, 200],
      [2, 300],
      [3, 400],
      [4, 500],
    ],
    cols: [
      createMockColumn({ name: "Month created" }),
      createMockColumn({ name: "count" }),
    ],
  }),
};

describe("buildEChartsSeries", () => {
  const build = () => {
    const chartModel = getCartesianChartModel(
      [mockSeries],
      mockSettings,
      hiddenSeries,
      mockRenderingContext,
    );

    const chartLayout = getChartLayout(
      chartModel,
      mockSettings,
      hasTimelineEvents,
      chartWidth,
      chartHeight,
      mockRenderingContext,
    );

    return buildEChartsSeries(
      chartModel,
      mockSettings,
      chartWidth,
      chartLayout,
      mockRenderingContext,
    );
  };

  it("shows all symbols on line series so every point stays hoverable (metabase#47847)", () => {
    seriesFn.mockReturnValue({ display: "line" });

    const options = build();
    const lineSeries = options.filter((option) => option.type === "line");

    expect(lineSeries.length).toBeGreaterThan(0);
    lineSeries.forEach((option) => {
      expect(option.showAllSymbol).toBe(true);
    });
  });
});
