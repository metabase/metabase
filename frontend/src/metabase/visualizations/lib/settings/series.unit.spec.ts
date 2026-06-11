import type { Series, VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { getComputedSettings } from "../settings";

import { getColors, seriesSetting } from "./series";

describe("Series unit settings", () => {
  describe("getColors", () => {
    it("should work for a card with a name", () => {
      const series = [createMockSingleSeries({ name: "The card" })];
      const settings = createMockVisualizationSettings({
        "graph.metrics": ["count"],
        "graph.dimensions": ["CATEGORY"],
      });

      const colors = getColors(series, settings);
      expect(colors).toEqual({
        "The card": "#7172AD",
      });
    });

    it("should work for a card with a _seriesKey", () => {
      const series = [
        {
          card: { ...createMockCard({ name: "Count" }), _seriesKey: "count" },
          ...createMockDataset(),
        },
      ];
      const settings = createMockVisualizationSettings({
        "graph.metrics": ["count"],
        "graph.dimensions": ["CATEGORY"],
      });

      const colors = getColors(series, settings);
      expect(colors).toEqual({
        count: "#509EE3",
      });
    });

    it("should work for visualizer series", () => {
      const series = [
        {
          card: {
            ...createMockCard({ name: "Count" }),
            _seriesKey: "COLUMN_2",
          },
          ...createMockDataset(),
          // columnValuesMapping is needed by the color assignment logic
          // because certain series have a specific color based on their name (count, for instance)
          // see frontend/src/metabase/ui/colors/groups.ts, getPreferredColor()
          columnValuesMapping: {
            COLUMN_1: [
              {
                sourceId: "card:124" as const,
                originalName: "CATEGORY",
                name: "COLUMN_1",
              },
            ],
            COLUMN_2: [
              {
                sourceId: "card:124" as const,
                originalName: "count",
                name: "COLUMN_2",
              },
            ],
          },
        },
      ];

      const settings = createMockVisualizationSettings({
        "card.title": "Bar chart with formatting options",
        "graph.metrics": ["COLUMN_2"],
        column_settings: {
          '["name","count"]': {
            number_style: "scientific",
            prefix: "Around ",
            suffix: "-ish",
          },
        },
        "graph.dimensions": ["COLUMN_1"],
        "graph.x_axis.scale": "ordinal",
      });

      const colors = getColors(series, settings);
      expect(colors).toEqual({
        COLUMN_2: "#509EE3", // This is the color for "count"
      });
    });
  });

  describe("line.* breakout series inheritance (metabase#10507)", () => {
    type LineSettingKey =
      | "line.missing"
      | "line.interpolate"
      | "line.style"
      | "line.size"
      | "line.marker_enabled";

    const LINE_INHERITANCE_CASES: {
      key: LineSettingKey;
      topLevel: string | boolean;
      override: string | boolean;
      builtInDefault: string | boolean | null;
    }[] = [
      {
        key: "line.missing",
        topLevel: "zero",
        override: "none",
        builtInDefault: "interpolate",
      },
      {
        key: "line.interpolate",
        topLevel: "step-after",
        override: "cardinal",
        builtInDefault: "linear",
      },
      {
        key: "line.style",
        topLevel: "dashed",
        override: "dotted",
        builtInDefault: "solid",
      },
      {
        key: "line.size",
        topLevel: "L",
        override: "S",
        builtInDefault: "M",
      },
      {
        key: "line.marker_enabled",
        topLevel: true,
        override: false,
        builtInDefault: null,
      },
    ];

    LINE_INHERITANCE_CASES.forEach(
      ({ key, topLevel, override, builtInDefault }) => {
        describe(key, () => {
          it(`should inherit the chart-level value as the default for every breakout series when no per-series override is set`, () => {
            const series = breakoutLineSeries();
            const perSeries = computeBreakoutSeriesSettings(series, {
              [key]: topLevel,
            });

            expect(perSeries[0]?.[key]).toEqual(topLevel);
            expect(perSeries[1]?.[key]).toEqual(topLevel);
          });

          it(`should let a per-series override win over the chart-level value`, () => {
            const series = breakoutLineSeries();
            const perSeries = computeBreakoutSeriesSettings(series, {
              [key]: topLevel,
              series_settings: { "series A": { [key]: override } },
            });

            expect(perSeries[0]?.[key]).toEqual(override);
            expect(perSeries[1]?.[key]).toEqual(topLevel);
          });

          it(`should fall back to the built-in default when neither chart-level nor per-series value is set`, () => {
            const series = breakoutLineSeries();
            const perSeries = computeBreakoutSeriesSettings(series, {});

            expect(perSeries[0]?.[key]).toEqual(builtInDefault);
            expect(perSeries[1]?.[key]).toEqual(builtInDefault);
          });
        });
      },
    );

    it("should leave a bar series in a combo chart unaffected by chart-level line.missing while the line series inherits it", () => {
      const series = [
        {
          card: {
            ...createMockCard({ display: "line" }),
            _seriesKey: "line series",
          },
          ...createMockDataset(),
        },
        {
          card: {
            ...createMockCard({ display: "bar" }),
            _seriesKey: "bar series",
          },
          ...createMockDataset(),
        },
      ];
      const perSeries = computeBreakoutSeriesSettings(series, {
        "line.missing": "zero",
      });

      expect(perSeries[0]?.["line.missing"]).toEqual("zero");
      expect(perSeries[0]?.display).toEqual("line");
      expect(perSeries[1]?.display).toEqual("bar");
    });
  });
});

const breakoutLineSeries = () => [
  {
    card: { ...createMockCard({ display: "line" }), _seriesKey: "series A" },
    ...createMockDataset(),
  },
  {
    card: { ...createMockCard({ display: "line" }), _seriesKey: "series B" },
    ...createMockDataset(),
  },
];

const computeBreakoutSeriesSettings = (
  series: Series,
  storedSettings: VisualizationSettings,
) => {
  const settings = getComputedSettings(seriesSetting(), series, storedSettings);
  return series.map((singleSeries) => settings.series?.(singleSeries));
};
