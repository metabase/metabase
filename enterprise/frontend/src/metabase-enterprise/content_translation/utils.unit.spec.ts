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
  translateColumnDisplayName,
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

describe("translateColumnDisplayName", () => {
  const tcWithColumnTranslations: ContentTranslationFunction = (str) => {
    const translations: Record<string, string> = {
      Total: "Gesamtsumme",
      Price: "Preis",
      Quantity: "Menge",
    };

    return typeof str === "string" ? (translations[str] ?? str) : str;
  };

  it("should return displayName unchanged when tc has no translations", () => {
    const result = translateColumnDisplayName(
      "Sum of Total",
      mockTranslateWithoutTranslations,
    );

    expect(result).toBe("Sum of Total");
  });

  it("should translate a simple column name without aggregation pattern", () => {
    const result = translateColumnDisplayName(
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
      const result = translateColumnDisplayName(
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
    const result = translateColumnDisplayName(input, tcWithColumnTranslations);
    expect(result).toBe(expected);
  });

  it("should return original string when column name has no translation", () => {
    const result = translateColumnDisplayName(
      "Sum of UnknownColumn",
      tcWithColumnTranslations,
    );

    expect(result).toBe("Sum of UnknownColumn");
  });

  it("should handle empty string", () => {
    const result = translateColumnDisplayName("", tcWithColumnTranslations);

    expect(result).toBe("");
  });

  describe("binning patterns", () => {
    it.each([
      ["Total: Auto binned", "Gesamtsumme: Auto binned"],
      // Dynamic binning patterns (handled by fallback)
      ["Total: 10 bins", "Gesamtsumme: 10 bins"],
      ["Total: 50 bins", "Gesamtsumme: 50 bins"],
      ["Total: 100 bins", "Gesamtsumme: 100 bins"],
      ["Price: 0.1°", "Preis: 0.1°"],
      ["Price: 1°", "Preis: 1°"],
      ["Price: 10°", "Preis: 10°"],
    ])(
      "should translate column name inside binning pattern: %s -> %s",
      (input, expected) => {
        const result = translateColumnDisplayName(
          input,
          tcWithColumnTranslations,
        );
        expect(result).toBe(expected);
      },
    );
  });

  describe("temporal bucket patterns", () => {
    it.each([
      ["Total: Day", "Gesamtsumme: Day"],
      ["Total: Month", "Gesamtsumme: Month"],
      ["Total: Year", "Gesamtsumme: Year"],
      ["Total: Hour", "Gesamtsumme: Hour"],
      ["Total: Week", "Gesamtsumme: Week"],
      ["Total: Quarter", "Gesamtsumme: Quarter"],
      ["Total: Hour of day", "Gesamtsumme: Hour of day"],
      ["Total: Day of week", "Gesamtsumme: Day of week"],
      ["Total: Day of month", "Gesamtsumme: Day of month"],
      ["Total: Day of year", "Gesamtsumme: Day of year"],
      ["Total: Week of year", "Gesamtsumme: Week of year"],
      ["Total: Month of year", "Gesamtsumme: Month of year"],
      ["Total: Quarter of year", "Gesamtsumme: Quarter of year"],
      ["Total: Minute of hour", "Gesamtsumme: Minute of hour"],
      ["Total: Minute", "Gesamtsumme: Minute"],
    ])(
      "should translate column name inside temporal bucket pattern: %s -> %s",
      (input, expected) => {
        const result = translateColumnDisplayName(
          input,
          tcWithColumnTranslations,
        );
        expect(result).toBe(expected);
      },
    );

    it("should handle combined aggregation and temporal bucket patterns", () => {
      const result = translateColumnDisplayName(
        "Sum of Total: Month",
        tcWithColumnTranslations,
      );
      expect(result).toBe("Sum of Gesamtsumme: Month");
    });
  });

  describe("edge cases", () => {
    it("should not incorrectly split column names that contain colon", () => {
      // If a column is named "Note: Important" (with colon in name),
      // it should be translated as a whole, not split
      const tcWithColonColumn: ContentTranslationFunction = (str) => {
        const translations: Record<string, string> = {
          "Note: Important": "Notiz: Wichtig",
        };

        return typeof str === "string" ? (translations[str] ?? str) : str;
      };

      const result = translateColumnDisplayName(
        "Note: Important",
        tcWithColonColumn,
      );
      expect(result).toBe("Notiz: Wichtig");
    });

    it("should split on colon and translate column if column has a translation", () => {
      // This handles backend-translated temporal bucket suffixes like "Monat", "Tag", etc.
      // where the suffix is already translated by the backend
      const result = translateColumnDisplayName(
        "Total: SomeRandomSuffix",
        tcWithColumnTranslations,
      );
      // "Total" has a translation, so it splits and translates the column part
      expect(result).toBe("Gesamtsumme: SomeRandomSuffix");
    });

    it("should handle backend-translated temporal bucket suffixes", () => {
      // The backend translates temporal unit names (e.g., "Month" -> "Monat" in German)
      // before the FE receives them. This test verifies that we still translate the column part.
      const result = translateColumnDisplayName(
        "Total: Monat", // German for "Month" - already translated by backend
        tcWithColumnTranslations,
      );
      expect(result).toBe("Gesamtsumme: Monat");
    });
  });

  describe("joined table patterns", () => {
    const tcWithJoinTranslations: ContentTranslationFunction = (str) => {
      const translations: Record<string, string> = {
        Total: "Gesamtsumme",
        Price: "Preis",
        Quantity: "Menge",
        Products: "Produkte",
        Orders: "Bestellungen",
        "Created At": "Erstellt am",
      };

      return typeof str === "string" ? (translations[str] ?? str) : str;
    };

    it.each([
      ["Products → Total", "Produkte → Gesamtsumme"],
      ["Products → Created At", "Produkte → Erstellt am"],
      ["Orders → Products → Total", "Bestellungen → Produkte → Gesamtsumme"],
    ])(
      "should translate joined table column names: %s -> %s",
      (input, expected) => {
        const result = translateColumnDisplayName(
          input,
          tcWithJoinTranslations,
        );
        expect(result).toBe(expected);
      },
    );

    it("should translate joined table with temporal bucket", () => {
      const result = translateColumnDisplayName(
        "Products → Created At: Month",
        tcWithJoinTranslations,
      );
      expect(result).toBe("Produkte → Erstellt am: Month");
    });

    it("should translate joined table with aggregation pattern", () => {
      const result = translateColumnDisplayName(
        "Distinct values of Products → Total",
        tcWithJoinTranslations,
      );
      expect(result).toBe("Distinct values of Produkte → Gesamtsumme");
    });

    it("should translate complex nested pattern with join, aggregation, and temporal bucket", () => {
      const result = translateColumnDisplayName(
        "Distinct values of Products → Created At: Month",
        tcWithJoinTranslations,
      );
      expect(result).toBe("Distinct values of Produkte → Erstellt am: Month");
    });

    it("should handle nested joins with temporal bucket", () => {
      const result = translateColumnDisplayName(
        "Orders → Products → Created At: Month",
        tcWithJoinTranslations,
      );
      expect(result).toBe("Bestellungen → Produkte → Erstellt am: Month");
    });

    describe("implicit join patterns (dash separator)", () => {
      // Add translations for implicit join patterns
      const tcWithImplicitJoinTranslations: ContentTranslationFunction = (
        str,
      ) => {
        const translations: Record<string, string> = {
          Total: "Gesamtsumme",
          Products: "Produkte",
          Product: "Produkt",
          Orders: "Bestellungen",
          People: "Personen",
          "Created At": "Erstellt am",
        };

        return typeof str === "string" ? (translations[str] ?? str) : str;
      };

      it("should translate implicit join alias with dash separator", () => {
        // "People - Product → Created At" has implicit join alias "People - Product"
        const result = translateColumnDisplayName(
          "People - Product → Created At",
          tcWithImplicitJoinTranslations,
        );
        expect(result).toBe("Personen - Produkt → Erstellt am");
      });

      it("should translate implicit join with temporal bucket", () => {
        const result = translateColumnDisplayName(
          "People - Product → Created At: Month",
          tcWithImplicitJoinTranslations,
        );
        expect(result).toBe("Personen - Produkt → Erstellt am: Month");
      });

      it("should translate aggregation with implicit join and temporal bucket", () => {
        const result = translateColumnDisplayName(
          "Distinct values of People - Product → Created At: Month",
          tcWithImplicitJoinTranslations,
        );
        expect(result).toBe(
          "Distinct values of Personen - Produkt → Erstellt am: Month",
        );
      });

      it("should NOT split on dash when there is no arrow separator", () => {
        // "My Question - Part 2" should be translated as a whole, not split on dash
        const tcWithQuestionName: ContentTranslationFunction = (str) => {
          const translations: Record<string, string> = {
            "My Question - Part 2": "Meine Frage - Teil 2",
          };
          return typeof str === "string" ? (translations[str] ?? str) : str;
        };

        const result = translateColumnDisplayName(
          "My Question - Part 2",
          tcWithQuestionName,
        );
        expect(result).toBe("Meine Frage - Teil 2");
      });
    });
  });

  describe("filter display name patterns", () => {
    const tcWithFilterTranslations: ContentTranslationFunction = (str) => {
      const translations: Record<string, string> = {
        Total: "Gesamtsumme",
        Price: "Preis",
        "Created At": "Erstellt am",
        Products: "Produkte",
        Status: "Status",
        "Review Requested At": "Überprüfung angefordert am",
        "Reviewed At": "Überprüft am",
        Category: "Kategorie",
      };

      return typeof str === "string" ? (translations[str] ?? str) : str;
    };

    it.each([
      ["Total is greater than 100", "Gesamtsumme is greater than 100"],
      [
        "Created At is in the previous 3 months",
        "Erstellt am is in the previous 3 months",
      ],
      ["Status is Active", "Status is Active"],
      ["Price is between 10 and 100", "Preis is between 10 and 100"],
      ["Total is empty", "Gesamtsumme is empty"],
      ["Total is not empty", "Gesamtsumme is not empty"],
      ["Status contains Active", "Status contains Active"],
      [
        "Sum of Total is greater than 100",
        "Sum of Gesamtsumme is greater than 100",
      ],
      [
        "Products → Price is greater than 50",
        "Produkte → Preis is greater than 50",
      ],
      ["Created At: Month is today", "Erstellt am: Month is today"],
      [
        "Unknown Column is greater than 100",
        "Unknown Column is greater than 100",
      ],
      [
        "Review Requested At is not empty or Reviewed At is not empty",
        "Überprüfung angefordert am is not empty or Überprüft am is not empty",
      ],
      [
        "Total is empty, Price is empty, and Status is empty",
        "Gesamtsumme is empty, Preis is empty, and Status is empty",
      ],
      [
        "Total is empty, Price is empty, Status is empty, and Category is empty",
        "Gesamtsumme is empty, Preis is empty, Status is empty, and Kategorie is empty",
      ],
    ])(
      "should translate column name in filter: %s -> %s",
      (input, expected) => {
        const result = translateColumnDisplayName(
          input,
          tcWithFilterTranslations,
        );
        expect(result).toBe(expected);
      },
    );
  });
});
