import type { ContentTranslationFunction } from "metabase/i18n/types";
import registerVisualizations from "metabase/visualizations/register";
import type {
  MaybeTranslatedSeries,
  Series,
  SeriesSettings,
  SingleSeries,
  VisualizationDisplay,
} from "metabase-types/api";
import { createMockDatasetData } from "metabase-types/api/mocks";

import { leaveUntranslated } from "./use-translate-content";
import { translateFieldValuesInSeries } from "./utils";

registerVisualizations();

const mockTranslateWithTranslations: ContentTranslationFunction = (value) => {
  if (typeof value === "string") {
    return `translated_${value}`;
  }
  return value;
};

const mockTranslateWithoutTranslations: ContentTranslationFunction =
  leaveUntranslated;

describe("translateFieldValuesInSeries", () => {
  it("should return original series when translation function has no translations", () => {
    const series: Series = [
      {
        data: {
          rows: [
            ["apple", 10],
            ["banana", 20],
          ],
        },
      } as SingleSeries,
    ];

    const result = translateFieldValuesInSeries(
      series,
      mockTranslateWithoutTranslations,
    );

    expect(result).toBe(series);
  });

  it("should return original series item when it has no data", () => {
    const series: Series = [
      {
        card: { name: "Test Chart" },
      } as SingleSeries,
    ];

    const result = translateFieldValuesInSeries(
      series,
      mockTranslateWithTranslations,
    );

    expect(result).toEqual([
      {
        card: { name: "Test Chart" },
      },
    ]);
  });

  it("should translate field values in regular series data", () => {
    const series: Series = [
      {
        data: {
          rows: [
            ["apple", 10],
            ["banana", 20],
            ["cherry", 30],
          ],
        },
      } as SingleSeries,
    ];

    const result = translateFieldValuesInSeries(
      series,
      mockTranslateWithTranslations,
    ) as MaybeTranslatedSeries;

    expect(result[0].data?.rows).toEqual([
      ["translated_apple", 10],
      ["translated_banana", 20],
      ["translated_cherry", 30],
    ]);
    expect(result[0].data?.untranslatedRows).toEqual([
      ["apple", 10],
      ["banana", 20],
      ["cherry", 30],
    ]);
  });

  it("should handle mixed data types in rows", () => {
    const series: Series = [
      {
        data: {
          rows: [
            ["text", 123, null, true],
            [456, "more text", false, undefined],
          ],
        },
      } as SingleSeries,
    ];

    const result = translateFieldValuesInSeries(
      series,
      mockTranslateWithTranslations,
    ) as MaybeTranslatedSeries;

    expect(result[0].data?.rows).toEqual([
      ["translated_text", 123, null, true],
      [456, "translated_more text", false, undefined],
    ]);
  });

  describe("for pies", () => {
    it("should handle pie.rows visualization settings", () => {
      const series: Series = [
        {
          card: {
            display: "pie",
            visualization_settings: {
              "pie.rows": [
                { key: "A", name: "Apple" },
                { key: "B", name: "Banana" },
                { key: "C", name: "Cherry" },
              ],
            },
          },
          data: {
            rows: [
              ["A", 10],
              ["B", 20],
              ["C", 30],
              ["D", 40], // key not in pie.rows
            ],
          },
        } as SingleSeries,
      ];

      const result = translateFieldValuesInSeries(
        series,
        mockTranslateWithTranslations,
      ) as MaybeTranslatedSeries;

      expect(result[0].data?.rows).toEqual([
        ["translated_Apple", 10],
        ["translated_Banana", 20],
        ["translated_Cherry", 30],
        ["translated_D", 40], // falls back to translating the key itself
      ]);
    });

    it("should handle NO pie.rows visualization settings", () => {
      const series: Series = [
        {
          card: {
            display: "pie",
            visualization_settings: {},
          },
          data: {
            rows: [
              ["apple", 10],
              ["banana", 20],
            ],
          },
        } as SingleSeries,
      ];

      const result = translateFieldValuesInSeries(
        series,
        mockTranslateWithTranslations,
      ) as MaybeTranslatedSeries;

      expect(result[0].data?.rows).toEqual([
        ["translated_apple", 10],
        ["translated_banana", 20],
      ]);
    });
  });

  const cartesianDisplayTypes: VisualizationDisplay[] = [
    "line",
    "bar",
    "area",
    "scatter",
    "combo",
  ];

  describe.each(cartesianDisplayTypes)("for %s charts", (displayType) => {
    it("should handle series_settings visualization settings", () => {
      const seriesSettings: Record<string, SeriesSettings> = {
        Banana: { title: "Coconut" },
      };

      const series: Series = [
        {
          card: {
            display: displayType,
            visualization_settings: {
              series_settings: seriesSettings,
            },
          },
          data: {
            rows: [
              ["Apple", 100, 30],
              ["Banana", 200, 70],
              ["Cherry", 300, 40],
            ],
          },
        } as SingleSeries,
      ];

      const result = translateFieldValuesInSeries(
        series,
        mockTranslateWithTranslations,
      ) as MaybeTranslatedSeries;

      expect(result[0].data?.rows).toEqual([
        ["translated_Apple", 100, 30],
        ["translated_Coconut", 200, 70],
        ["translated_Cherry", 300, 40],
      ]);
    });

    it("should handle NO series_settings visualization settings", () => {
      const series: Series = [
        {
          card: {
            display: displayType,
            visualization_settings: {},
          },
          data: {
            rows: [
              ["Apple", 100, 30],
              ["Banana", 200, 70],
              ["Cherry", 300, 40],
            ],
          },
        } as SingleSeries,
      ];

      const result = translateFieldValuesInSeries(
        series,
        mockTranslateWithTranslations,
      ) as MaybeTranslatedSeries;

      expect(result[0].data?.rows).toEqual([
        ["translated_Apple", 100, 30],
        ["translated_Banana", 200, 70],
        ["translated_Cherry", 300, 40],
      ]);
    });
  });

  it("should handle multiple series", () => {
    const series: Series = [
      {
        data: {
          rows: [["apple", 10]],
        },
      } as SingleSeries,
      {
        data: {
          rows: [["banana", 20]],
        },
      } as SingleSeries,
    ];

    const result = translateFieldValuesInSeries(
      series,
      mockTranslateWithTranslations,
    ) as MaybeTranslatedSeries;

    expect(result).toHaveLength(2);
    expect(result[0].data?.rows).toEqual([["translated_apple", 10]]);
    expect(result[1].data?.rows).toEqual([["translated_banana", 20]]);
  });

  it("should handle empty rows", () => {
    const series: Series = [
      {
        data: createMockDatasetData({
          rows: [],
        }),
      } as SingleSeries,
    ];

    const result = translateFieldValuesInSeries(
      series,
      mockTranslateWithTranslations,
    ) as MaybeTranslatedSeries;

    expect(result[0].data?.rows).toEqual([]);
    expect(result[0].data?.untranslatedRows).toEqual([]);
  });
});
