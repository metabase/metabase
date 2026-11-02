import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { DEFAULT_VISUALIZATION_THEME } from "../../../../shared/utils/theme";
import type { RenderingContext } from "../../../../types";
import { getChartLayout } from "../../layout";
import { getWaterfallChartModel } from "../model";

import { getWaterfallChartOption } from "./index";

const renderingContext: RenderingContext = {
  getColor: () => "#509EE3",
  measureText: (text) => text.length * 8,
  measureTextHeight: () => 12,
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

const rawSeries: RawSeries = [
  {
    card: createMockCard({ id: 1, name: "Waterfall", display: "waterfall" }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "bucket", base_type: "type/Text" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      rows: [
        ["a", 100],
        ["b", -50],
        ["c", 300],
      ],
    }),
  },
];

const settings = createMockVisualizationSettings({
  "graph.dimensions": ["bucket"],
  "graph.metrics": ["count"],
});

describe("getWaterfallChartOption", () => {
  it("returns an empty option when there are no series", () => {
    const chartModel = getWaterfallChartModel(
      rawSeries,
      settings,
      [],
      renderingContext,
    );
    const chartLayout = getChartLayout(
      chartModel,
      settings,
      false,
      480,
      360,
      renderingContext,
    );

    const option = getWaterfallChartOption(
      { ...chartModel, seriesModels: [] },
      480,
      chartLayout,
      false,
      null,
      [],
      settings,
      false,
      renderingContext,
    );

    expect(option).toEqual({});
  });
});
