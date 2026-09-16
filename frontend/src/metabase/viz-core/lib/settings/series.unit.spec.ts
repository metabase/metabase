import _ from "underscore";

import { checkNotNull } from "metabase/utils/types";
import type { Series, SingleSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockDatasetData,
  createMockInsight,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { SERIES_SETTING_KEY } from "../../shared/settings/series";
import type {
  ComputedVisualizationSettings,
  VisualizationSettingsDefinitions,
} from "../../types";

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
});

describe("series trend line settings", () => {
  // the definitions map has a catch-all index signature, so type the nested
  // widget props at this boundary to keep the guard calls below checked
  type SeriesSettingsWidgetProps = {
    getSettingDefinitionsForObject: (
      series: Series,
      single: SingleSeries,
    ) => VisualizationSettingsDefinitions;
  };

  const getSeriesSettingDefinitions = (
    series: Series,
    settings: ComputedVisualizationSettings,
  ): VisualizationSettingsDefinitions => {
    const getProps = checkNotNull(
      seriesSetting()[SERIES_SETTING_KEY]?.getProps,
    );
    const { getSettingDefinitionsForObject }: SeriesSettingsWidgetProps =
      getProps(series, { [SERIES_SETTING_KEY]: {}, ...settings }, _.noop, {
        series,
        settings,
      });
    return getSettingDefinitionsForObject(series, series[0]);
  };

  const getIsHidden = (
    key: "show_series_trendline" | "trendline.color" | "trendline.style",
    series: Series,
    settings: ComputedVisualizationSettings,
    seriesSettings: ComputedVisualizationSettings = {},
    single: SingleSeries = series[0],
  ) => {
    const definitions = getSeriesSettingDefinitions(series, settings);
    const getHidden = checkNotNull(definitions[key]?.getHidden);
    return getHidden(single, seriesSettings, { series, settings });
  };

  const insights = [createMockInsight({ col: "count" })];

  const multiMetricSeries = (): Series => [
    createMockSingleSeries(
      { name: "count" },
      { data: createMockDatasetData({ insights }) },
    ),
    createMockSingleSeries(
      { name: "sum" },
      { data: createMockDatasetData({ insights }) },
    ),
  ];

  // series produced by a breakout carry no insights; only the raw card does
  const breakoutSeries = (): Series =>
    Object.assign(
      [
        createMockSingleSeries(
          { name: "Gadget" },
          { data: createMockDatasetData({ insights: undefined }) },
        ),
        createMockSingleSeries(
          { name: "Gizmo" },
          { data: createMockDatasetData({ insights: undefined }) },
        ),
      ],
      {
        _raw: [
          createMockSingleSeries(
            {},
            { data: createMockDatasetData({ insights }) },
          ),
        ],
      },
    );

  const trendLineEnabled = { show_series_trendline: true };

  it("should show the series trend line settings for multiple metrics with a single dimension", () => {
    const settings = {
      "graph.show_trendline": true,
      "graph.dimensions": ["CREATED_AT"],
    };

    expect(
      getIsHidden("show_series_trendline", multiMetricSeries(), settings),
    ).toBe(false);
    expect(
      getIsHidden(
        "trendline.color",
        multiMetricSeries(),
        settings,
        trendLineEnabled,
      ),
    ).toBe(false);
    expect(
      getIsHidden(
        "trendline.style",
        multiMetricSeries(),
        settings,
        trendLineEnabled,
      ),
    ).toBe(false);
  });

  it("should hide the series trend line settings when the chart has multiple dimensions", () => {
    const settings = {
      "graph.show_trendline": true,
      "graph.dimensions": ["CREATED_AT", "CATEGORY"],
    };

    expect(
      getIsHidden("show_series_trendline", breakoutSeries(), settings),
    ).toBe(true);
    expect(
      getIsHidden(
        "trendline.color",
        breakoutSeries(),
        settings,
        trendLineEnabled,
      ),
    ).toBe(true);
    expect(
      getIsHidden(
        "trendline.style",
        breakoutSeries(),
        settings,
        trendLineEnabled,
      ),
    ).toBe(true);
  });

  it("should hide the series trend line settings when the series have no insights", () => {
    const settings = {
      "graph.show_trendline": true,
      "graph.dimensions": ["CREATED_AT"],
    };
    const series: Series = [
      createMockSingleSeries(
        { name: "count" },
        { data: createMockDatasetData({ insights: [] }) },
      ),
      createMockSingleSeries(
        { name: "sum" },
        { data: createMockDatasetData({ insights: [] }) },
      ),
    ];

    expect(getIsHidden("show_series_trendline", series, settings)).toBe(true);
    expect(
      getIsHidden("trendline.color", series, settings, trendLineEnabled),
    ).toBe(true);
  });

  it("should read insights from the raw series behind transformed series", () => {
    const settings = {
      "graph.show_trendline": true,
      "graph.dimensions": ["CREATED_AT"],
    };

    expect(
      getIsHidden("show_series_trendline", breakoutSeries(), settings),
    ).toBe(false);
  });

  it("should check the insights of each series' own card when cards are combined", () => {
    const settings = {
      "graph.show_trendline": true,
      "graph.dimensions": ["CREATED_AT"],
    };
    const series: Series = Object.assign(
      [
        createMockSingleSeries(
          { id: 1, name: "Orders" },
          { data: createMockDatasetData({ insights: undefined }) },
        ),
        createMockSingleSeries(
          { id: 2, name: "Revenue" },
          { data: createMockDatasetData({ insights: undefined }) },
        ),
      ],
      {
        _raw: [
          createMockSingleSeries(
            { id: 1, name: "Orders" },
            { data: createMockDatasetData({ insights: [] }) },
          ),
          createMockSingleSeries(
            { id: 2, name: "Revenue" },
            { data: createMockDatasetData({ insights }) },
          ),
        ],
      },
    );

    expect(
      getIsHidden("show_series_trendline", series, settings, {}, series[0]),
    ).toBe(true);
    expect(
      getIsHidden("show_series_trendline", series, settings, {}, series[1]),
    ).toBe(false);
    expect(
      getIsHidden(
        "trendline.color",
        series,
        settings,
        trendLineEnabled,
        series[1],
      ),
    ).toBe(false);
  });
});
