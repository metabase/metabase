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
import {
  getTranslatedFilterDisplayName,
  translateAggregationDisplayName,
  translateFieldValuesInSeries,
} from "./utils";

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

describe("getTranslatedFilterDisplayName", () => {
  const tcWithPlanTranslation: ContentTranslationFunction = (str) =>
    str === "Plan" ? "My new name" : str;

  const tcWithStatusTranslation: ContentTranslationFunction = (str) =>
    str === "Status" ? "Estado" : str;

  const tcWithPriceTranslation: ContentTranslationFunction = (str) =>
    str === "Price" ? "Preis" : str;

  it("should only replace the first occurrence of column name - 'Plan is Plan' becomes 'My new name is Plan'", () => {
    const result = getTranslatedFilterDisplayName(
      "Plan is Plan",
      tcWithPlanTranslation,
      "Plan",
    );

    expect(result).toBe("My new name is Plan");
  });

  it("should preserve the value when column name appears multiple times", () => {
    const result = getTranslatedFilterDisplayName(
      "Status is Status",
      tcWithStatusTranslation,
      "Status",
    );

    expect(result).toBe("Estado is Status");
  });

  it("should handle column name at the start of the string", () => {
    const result = getTranslatedFilterDisplayName(
      "Price is between 10 and 20",
      tcWithPriceTranslation,
      "Price",
    );

    expect(result).toBe("Preis is between 10 and 20");
  });

  it("should not replace anything if column name is not in display name", () => {
    const tcWithQuantityTranslation: ContentTranslationFunction = (str) =>
      str === "Quantity" ? "Menge" : str;

    const result = getTranslatedFilterDisplayName(
      "Total is greater than 100",
      tcWithQuantityTranslation,
      "Quantity",
    );

    expect(result).toBe("Total is greater than 100");
  });

  it("should return displayName unchanged when tc returns same value (no translations)", () => {
    const result = getTranslatedFilterDisplayName(
      "Total is greater than 100",
      mockTranslateWithoutTranslations,
      "Total",
    );

    expect(result).toBe("Total is greater than 100");
  });

  it("should return empty string when displayName is empty", () => {
    const result = getTranslatedFilterDisplayName("", tcWithPlanTranslation);

    expect(result).toBe("");
  });

  it("should fallback to translating the whole string when no columnDisplayName provided", () => {
    const tcWithFullTranslation: ContentTranslationFunction = (str) =>
      str === "Some filter" ? "Ein Filter" : str;

    const result = getTranslatedFilterDisplayName(
      "Some filter",
      tcWithFullTranslation,
    );

    expect(result).toBe("Ein Filter");
  });
});

describe("translateAggregationDisplayName", () => {
  const tcWithColumnTranslations: ContentTranslationFunction = (str) => {
    const translations: Record<string, string> = {
      Total: "Gesamtsumme",
      Price: "Preis",
      Quantity: "Menge",
    };

    return typeof str === "string" ? (translations[str] ?? str) : str;
  };

  it("should return displayName unchanged when tc has no translations", () => {
    const result = translateAggregationDisplayName(
      "Sum of Total",
      mockTranslateWithoutTranslations,
    );

    expect(result).toBe("Sum of Total");
  });

  it("should translate a simple column name without aggregation pattern", () => {
    const result = translateAggregationDisplayName(
      "Total",
      tcWithColumnTranslations,
    );

    expect(result).toBe("Gesamtsumme");
  });

  it.each([
    ["Sum of Total", "Sum of Gesamtsumme"],
    [
      "Sum of Total matching condition",
      "Sum of Gesamtsumme matching condition",
    ],
    ["Average of Price", "Average of Preis"],
    ["Count of Quantity", "Count of Menge"],
    ["Min of Price", "Min of Preis"],
    ["Max of Price", "Max of Preis"],
    ["Median of Total", "Median of Gesamtsumme"],
    ["Cumulative count of Total", "Cumulative count of Gesamtsumme"],
    ["Cumulative sum of Total", "Cumulative sum of Gesamtsumme"],
    ["Distinct values of Total", "Distinct values of Gesamtsumme"],
    ["Standard deviation of Total", "Standard deviation of Gesamtsumme"],
    ["Variance of Total", "Variance of Gesamtsumme"],
  ])(
    "should translate column name inside aggregation pattern: %s -> %s",
    (input, expected) => {
      const result = translateAggregationDisplayName(
        input,
        tcWithColumnTranslations,
      );
      expect(result).toBe(expected);
    },
  );

  it.each([
    ["Sum of Min of Total", "Sum of Min of Gesamtsumme"],
    ["Average of Sum of Min of Price", "Average of Sum of Min of Preis"],
  ])("should handle nested aggregations: %s -> %s", (input, expected) => {
    const result = translateAggregationDisplayName(
      input,
      tcWithColumnTranslations,
    );
    expect(result).toBe(expected);
  });

  it("should return original string when column name has no translation", () => {
    const result = translateAggregationDisplayName(
      "Sum of UnknownColumn",
      tcWithColumnTranslations,
    );

    expect(result).toBe("Sum of UnknownColumn");
  });

  it("should handle empty string", () => {
    const result = translateAggregationDisplayName(
      "",
      tcWithColumnTranslations,
    );

    expect(result).toBe("");
  });

  describe("RTL and wrapped patterns", () => {
    // RTL pattern: value comes first, then the aggregation text
    // e.g., Hebrew: "{value} של סכום" (Sum of {value})
    const rtlPatterns = [(value: string) => `${value} של סכום`];

    // Wrapped pattern: value is surrounded by prefix and suffix
    // e.g., hypothetical French: "Somme de {value} totale"
    const wrappedPatterns = [(value: string) => `Somme de ${value} totale`];

    it("should handle RTL patterns where value comes first", () => {
      const result = translateAggregationDisplayName(
        "Total של סכום",
        tcWithColumnTranslations,
        rtlPatterns,
      );

      expect(result).toBe("Gesamtsumme של סכום");
    });

    it("should handle wrapped patterns where value is in the middle", () => {
      const result = translateAggregationDisplayName(
        "Somme de Total totale",
        tcWithColumnTranslations,
        wrappedPatterns,
      );

      expect(result).toBe("Somme de Gesamtsumme totale");
    });

    it("should handle nested RTL patterns", () => {
      const nestedRtlPatterns = [
        (value: string) => `${value} של סכום`,
        (value: string) => `${value} של מינימום`,
      ];

      const result = translateAggregationDisplayName(
        "Total של מינימום של סכום",
        tcWithColumnTranslations,
        nestedRtlPatterns,
      );

      expect(result).toBe("Gesamtsumme של מינימום של סכום");
    });

    it("should handle nested wrapped patterns", () => {
      const nestedWrappedPatterns = [
        (value: string) => `Somme de ${value} totale`,
        (value: string) => `Minimum de ${value} local`,
      ];

      const result = translateAggregationDisplayName(
        "Somme de Minimum de Total local totale",
        tcWithColumnTranslations,
        nestedWrappedPatterns,
      );

      expect(result).toBe("Somme de Minimum de Gesamtsumme local totale");
    });
  });
});
