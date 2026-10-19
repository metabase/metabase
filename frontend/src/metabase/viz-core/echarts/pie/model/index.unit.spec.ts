import { color } from "metabase/ui/colors";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import type { RenderingContext } from "../../../types";

import { getPieChartModel } from ".";

describe("getPieChartModel", () => {
  const columns = [
    createMockColumn({
      name: "birth_year",
      display_name: "Birth Year",
      base_type: "type/Number",
      semantic_type: "type/Number",
    }),
    createMockColumn({
      name: "count",
      display_name: "Count",
      base_type: "type/Number",
      semantic_type: "type/Number",
    }),
  ];

  const rawSeries = [
    {
      card: createMockCard({
        name: "Pie card",
        display: "pie",
      }),
      data: createMockDatasetData({
        rows: [
          [1940, 9],
          [1950, 64],
          [1960, 159],
          [1970, 257],
          [1980, 398],
          [1990, 594],
          [2000, 362],
          [2010, 18],
        ],
        cols: columns,
      }),
    },
  ];

  // Unjustified type cast. FIXME
  const settings = {
    "pie.metric": "count",
    column_settings: {},
    "pie.dimension": ["birth_year"],
    "pie.sort_rows": false,
    "pie.slice_threshold": 2.5,
    "pie.rows": [
      {
        key: "2000",
        name: "2 000 to 2 010",
        originalName: "2 000 to 2 010",
        color: "#98D9D9",
        defaultColor: true,
        enabled: true,
        hidden: false,
        isOther: false,
      },
      {
        key: "1990",
        name: "1 990 to 2 000",
        originalName: "1 990 to 2 000",
        color: "#7172AD",
        defaultColor: true,
        enabled: true,
        hidden: false,
        isOther: false,
      },
      {
        key: "1940",
        name: "1 940 to 1 950",
        originalName: "1 940 to 1 950",
        color: "#F9D45C",
        defaultColor: true,
        enabled: true,
        hidden: false,
        isOther: true,
      },
      {
        key: "1980",
        name: "1 980 to 1 990",
        originalName: "1 980 to 1 990",
        color: "#509EE3",
        defaultColor: true,
        enabled: true,
        hidden: false,
        isOther: false,
      },
      {
        key: "1970",
        name: "1 970 to 1 980",
        originalName: "1 970 to 1 980",
        color: "#88BF4D",
        defaultColor: true,
        enabled: true,
        hidden: false,
        isOther: false,
      },
      {
        key: "1960",
        name: "1 960 to 1 970",
        originalName: "1 960 to 1 970",
        color: "#A989C5",
        defaultColor: true,
        enabled: true,
        hidden: false,
        isOther: false,
      },
      {
        key: "1950",
        name: "1 950 to 1 960",
        originalName: "1 950 to 1 960",
        color: "#EF8C8C",
        defaultColor: true,
        enabled: true,
        hidden: false,
        isOther: false,
      },
      {
        key: "2010",
        name: "2 010 to 2 020",
        originalName: "2 010 to 2 020",
        color: "#F2A86F",
        defaultColor: true,
        enabled: true,
        hidden: false,
        isOther: true,
      },
    ],
    "pie.sort_rows_dimension": ["birth_year"],
    series_settings: {},
    "pie.show_legend": true,
    "pie.show_total": true,
    "pie.show_labels": false,
    "pie.percent_visibility": "legend",
  } as VisualizationSettings;

  const renderingContext: RenderingContext = {
    getColor: () => "#000000",
    measureText: () => 10,
    measureTextHeight: () => 10,
    fontFamily: "Arial",
    // Unjustified type cast. FIXME
    theme: {
      pie: {
        borderColor: "#000000",
      },
    } as any, // Mocking the theme object
  };

  it("should compute the proper legendHoverIndex (metabase#55684)", () => {
    const chartModel = getPieChartModel(
      rawSeries,
      settings,
      [],
      renderingContext,
    );

    expect(
      Array.from(chartModel.sliceTree.entries()).map(([key, value]) => {
        return [key, value.legendHoverIndex];
      }),
    ).toEqual([
      ["2000", 0],
      ["1990", 1],
      ["1980", 2],
      ["1970", 3],
      ["1960", 4],
      ["1950", 5],
      ["\x00___OTHER___", 6],
    ]);
  });

  it("should use the palette color a slice records over its stored color", () => {
    // only pie.rows differs from the settings object above
    const settingsWithColorName = {
      ...settings,
      "pie.rows": settings["pie.rows"]?.map((row) =>
        row.key === "2000"
          ? {
              ...row,
              color: "#123456",
              defaultColor: false,
              color_name: "accent3",
            }
          : row,
      ),
    } as VisualizationSettings;

    const chartModel = getPieChartModel(
      rawSeries,
      settingsWithColorName,
      [],
      renderingContext,
    );

    expect(chartModel.sliceTree.get("2000")?.color).toBe(color("accent3"));
  });

  it("should keep the stored color of a slice that records no palette color", () => {
    // only pie.rows differs from the settings object above
    const settingsWithStoredColor = {
      ...settings,
      "pie.rows": settings["pie.rows"]?.map((row) =>
        row.key === "2000"
          ? { ...row, color: "#123456", defaultColor: false }
          : row,
      ),
    } as VisualizationSettings;

    const chartModel = getPieChartModel(
      rawSeries,
      settingsWithStoredColor,
      [],
      renderingContext,
    );

    expect(chartModel.sliceTree.get("2000")?.color).toBe("#123456");
  });

  describe("multiple rings", () => {
    const ringColumns = [
      createMockColumn({
        name: "birth_year",
        display_name: "Birth Year",
        base_type: "type/Number",
        semantic_type: "type/Number",
      }),
      createMockColumn({
        name: "region",
        display_name: "Region",
        base_type: "type/Text",
        semantic_type: "type/Category",
      }),
      createMockColumn({
        name: "count",
        display_name: "Count",
        base_type: "type/Number",
        semantic_type: "type/Number",
      }),
    ];

    const ringRawSeries = [
      {
        card: createMockCard({ name: "Two ring pie", display: "pie" }),
        data: createMockDatasetData({
          rows: [
            [2000, "North", 50],
            [2000, "South", 50],
          ],
          cols: ringColumns,
        }),
      },
    ];

    // pie.rows carries the hand-picked color under test
    const ringSettings = {
      "pie.metric": "count",
      "pie.dimension": ["birth_year", "region"],
      column_settings: {},
      column: () => ({}),
      "pie.slice_threshold": 0,
      "pie.rows": [
        {
          key: "2000",
          name: "2000",
          originalName: "2000",
          color: "#123456",
          color_name: "accent3",
          defaultColor: false,
          enabled: true,
          hidden: false,
          isOther: false,
        },
      ],
      series_settings: {},
    } as VisualizationSettings;

    // Aliases must resolve for ring shades to differ
    const ringRenderingContext: RenderingContext = {
      ...renderingContext,
      getColor: (name: string) => color(name),
    };

    it("derives ring shades from the recorded palette color, not the stored one", () => {
      const chartModel = getPieChartModel(
        ringRawSeries,
        ringSettings,
        [],
        ringRenderingContext,
      );

      const slice = chartModel.sliceTree.get("2000");

      expect(slice?.color).toBe(color("accent3-dark"));
      expect(slice?.color).not.toBe("#123456");
    });
  });
});
