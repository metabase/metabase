import { DateTimeColumn, NumberColumn } from "__support__/visualizations";
import * as measureText from "metabase/lib/measure-text";
import type { FontStyle } from "metabase/visualizations/shared/types/measure-text";
import type {
  DatasetColumn,
  DateTimeAbsoluteUnit,
  RowValues,
  SmartScalarComparison,
  SmartScalarComparisonAnotherColumn,
  SmartScalarComparisonStaticNumber,
  VisualizationSettings,
} from "metabase-types/api";
import type { Insight } from "metabase-types/api/insight";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { COMPARISON_TYPES } from "./constants";
import {
  COMPARISON_SELECTOR_OPTIONS,
  formatChange,
  formatChangeAutoPrecision,
  getChangeWidth,
  getComparisonOptions,
  getDefaultComparison,
  getValueWidth,
  isComparisonValid,
} from "./utils";

jest.doMock("metabase/lib/measure-text", () => ({
  measureText: jest.fn(),
}));

const createMockMeasureText = (width: number, height: number) => {
  return (_text: string, _style: FontStyle) => ({ width, height });
};

const getAutoPrecisionOptions = (width: number) => {
  return { fontFamily: "Lato", fontWeight: 400, width };
};

describe("SmartScalar > utils", () => {
  describe("scalar.comparisons", () => {
    const FIELD_NAME = "Count";
    const createInsights = (dateUnit: DateTimeAbsoluteUnit): Insight[] => [
      {
        unit: dateUnit,
        col: FIELD_NAME,
        offset: 0,
        slope: 0,
        "last-change": 0,
        "last-value": 0,
        "previous-value": 0,
      },
    ];
    const cols = [
      createMockColumn(DateTimeColumn({ name: "Month" })),
      createMockColumn(NumberColumn({ name: "Count" })),
    ];
    const series = ({
      cols: colsArg = cols,
      rows,
      insights,
    }: {
      cols?: DatasetColumn[];
      rows: RowValues[];
      insights: Insight[] | undefined;
    }) => [
      createMockSingleSeries({}, { data: { cols: colsArg, rows, insights } }),
    ];

    describe("getDefaultComparison", () => {
      const settings = {
        "scalar.field": FIELD_NAME,
      };
      it("should return previous value as default if no dateUnit", () => {
        const rows = [
          ["2019-10-01", 100],
          ["2019-11-01", 300],
        ];
        const defaultComparison = getDefaultComparison(
          series({ rows, insights: [] }),
          settings,
        );

        expect(defaultComparison).toEqual([
          {
            id: expect.any(String),
            type: COMPARISON_TYPES.PREVIOUS_VALUE,
          },
        ]);
      });

      it("should return previous period as default if there is a dateUnit", () => {
        const rows = [
          ["2019-10-01", 100],
          ["2019-11-01", 300],
        ];
        const dateUnit = "month";
        const insights = createInsights(dateUnit);
        const defaultComparison = getDefaultComparison(
          series({ rows, insights }),
          settings,
        );

        expect(defaultComparison).toEqual([
          {
            id: expect.any(String),
            type: COMPARISON_TYPES.PREVIOUS_PERIOD,
          },
        ]);
      });
    });

    describe("getComparisonOptions", () => {
      const settings = {
        "scalar.field": FIELD_NAME,
      };

      it("should not return 'periods ago' or `previous period` option if no dateUnit", () => {
        const rows = [
          ["2019-10-01", 100],
          ["2019-11-01", 300],
        ];
        const comparisonOptions = getComparisonOptions(
          series({ rows, insights: [] }),
          settings,
        );

        expect(comparisonOptions).toEqual([
          COMPARISON_SELECTOR_OPTIONS.PREVIOUS_VALUE,
          COMPARISON_SELECTOR_OPTIONS.STATIC_NUMBER,
        ]);
      });

      it("should not return 'periods ago' if dateUnit is supplied but dataset only ranges 1 period in the past", () => {
        const rows = [
          ["2019-10-01", 100],
          ["2019-11-01", 300],
        ];
        const dateUnit = "month";
        const insights = createInsights(dateUnit);
        const comparisonOptions = getComparisonOptions(
          series({ rows, insights }),
          settings,
        );

        expect(comparisonOptions).toEqual([
          {
            type: COMPARISON_TYPES.PREVIOUS_PERIOD,
            name: "Previous month",
          },
          COMPARISON_SELECTOR_OPTIONS.PREVIOUS_VALUE,
          COMPARISON_SELECTOR_OPTIONS.STATIC_NUMBER,
        ]);
      });

      it("should return 'another column' if there is at least one more numeric column", () => {
        const anotherColumn = createMockColumn(
          NumberColumn({ name: "Average" }),
        );
        const rows = [
          ["2019-10-01", 100, 110],
          ["2019-11-01", 300, 250],
        ];
        const comparisonOptions = getComparisonOptions(
          series({
            cols: [...cols, anotherColumn],
            rows,
            insights: [],
          }),
          settings,
        );

        expect(comparisonOptions).toEqual([
          COMPARISON_SELECTOR_OPTIONS.PREVIOUS_VALUE,
          COMPARISON_SELECTOR_OPTIONS.ANOTHER_COLUMN,
          COMPARISON_SELECTOR_OPTIONS.STATIC_NUMBER,
        ]);
      });

      it("should not return 'another column' if there are no other numeric columns", () => {
        const rows = [
          ["2019-10-01", 100],
          ["2019-11-01", 300],
        ];
        const comparisonOptions = getComparisonOptions(
          series({ rows, insights: [] }),
          settings,
        );

        expect(comparisonOptions).toEqual([
          COMPARISON_SELECTOR_OPTIONS.PREVIOUS_VALUE,
          COMPARISON_SELECTOR_OPTIONS.STATIC_NUMBER,
        ]);
      });

      it("should return sensible options if dateUnit is supplied and dataset ranges more than 1 period in the past", () => {
        const rows = [
          ["2019-08-01", 80],
          ["2019-09-01", 80],
          ["2019-10-01", 100],
          ["2019-11-01", 300],
        ];
        const dateUnit = "month";
        const insights = createInsights(dateUnit);
        const comparisonOptions = getComparisonOptions(
          series({ rows, insights }),
          settings,
        );

        expect(comparisonOptions).toEqual([
          {
            type: COMPARISON_TYPES.PREVIOUS_PERIOD,
            name: "Previous month",
          },
          {
            type: COMPARISON_TYPES.PERIODS_AGO,
            name: "months ago",
            maxValue: 3,
          },
          COMPARISON_SELECTOR_OPTIONS.PREVIOUS_VALUE,
          COMPARISON_SELECTOR_OPTIONS.STATIC_NUMBER,
        ]);
      });
    });

    describe("isComparisonValid", () => {
      it("should always return true if type is previousValue comparison", () => {
        const comparison = { id: "1", type: COMPARISON_TYPES.PREVIOUS_VALUE };
        const settings = {
          "scalar.field": FIELD_NAME,
          "scalar.comparisons": [comparison],
        };
        const rows = [
          ["2019-10-01", 100],
          ["2019-11-01", 300],
        ];
        const isValid = isComparisonValid(
          comparison,
          series({ rows, insights: [] }),
          settings,
        );

        expect(isValid).toBeTruthy();
      });

      it("should always return false if ID is missing", () => {
        const comparison = { type: COMPARISON_TYPES.PREVIOUS_VALUE };
        const settings = {
          "scalar.field": FIELD_NAME,
          "scalar.comparisons": [comparison],
        };
        const rows = [
          ["2019-10-01", 100],
          ["2019-11-01", 300],
        ];
        const isValid = isComparisonValid(
          comparison as SmartScalarComparison,
          series({ rows, insights: [] }),
          settings as VisualizationSettings,
        );

        expect(isValid).toBe(false);
      });

      it.each([
        [
          COMPARISON_TYPES.PERIODS_AGO,
          { id: "1", type: COMPARISON_TYPES.PERIODS_AGO, value: 3 },
        ],
        [
          COMPARISON_TYPES.PREVIOUS_PERIOD,
          { id: "1", type: COMPARISON_TYPES.PREVIOUS_PERIOD },
        ],
      ])(
        "should return false for %s comparison when dateUnit is missing",
        (_, comparison) => {
          const settings = {
            "scalar.field": FIELD_NAME,
            "scalar.comparisons": [comparison],
          };
          const rows = [
            ["2019-10-01", 100],
            ["2019-11-01", 300],
          ];
          const isValid = isComparisonValid(
            comparison,
            series({ rows, insights: [] }),
            settings,
          );

          expect(isValid).toBeFalsy();
        },
      );

      it.each([
        [
          COMPARISON_TYPES.PERIODS_AGO,
          { id: "1", type: COMPARISON_TYPES.PERIODS_AGO, value: 3 },
        ],
        [
          COMPARISON_TYPES.PREVIOUS_PERIOD,
          { id: "1", type: COMPARISON_TYPES.PREVIOUS_PERIOD },
        ],
        [
          COMPARISON_TYPES.STATIC_NUMBER,
          {
            id: "1",
            type: COMPARISON_TYPES.STATIC_NUMBER,
            value: 100,
            label: "Goal",
          },
        ],
      ])(
        "should return true for %s comparison when dateUnit is supplied",
        (_, comparison) => {
          const settings = {
            "scalar.field": FIELD_NAME,
            "scalar.comparisons": [comparison],
          };
          const rows = [
            ["2019-10-01", 100],
            ["2019-11-01", 300],
          ];
          const insights = createInsights("month");
          const isValid = isComparisonValid(
            comparison,
            series({ rows, insights }),
            settings,
          );

          expect(isValid).toBeTruthy();
        },
      );

      describe("'another column' comparison", () => {
        const anotherColumn = createMockColumn(
          NumberColumn({ name: "Average" }),
        );
        const multiSeries = series({
          cols: [...cols, anotherColumn],
          rows: [
            ["2019-10-01", 100, 110],
            ["2019-11-01", 300, 250],
          ],
          insights: [],
        });

        it("should return true when valid", () => {
          const comparison = {
            id: "1",
            type: COMPARISON_TYPES.ANOTHER_COLUMN,
            label: "Avg",
            column: "Average",
          };
          const settings = {
            "scalar.field": FIELD_NAME,
            "scalar.comparisons": [comparison],
          };

          const isValid = isComparisonValid(
            comparison,
            multiSeries,
            settings as VisualizationSettings,
          );

          expect(isValid).toBe(true);
        });

        it("should return false when column is missing", () => {
          const comparison = {
            type: COMPARISON_TYPES.ANOTHER_COLUMN,
            label: "Count",
          };
          const settings = {
            "scalar.field": FIELD_NAME,
            "scalar.comparisons": [comparison],
          };

          const isValid = isComparisonValid(
            comparison as SmartScalarComparisonAnotherColumn,
            multiSeries,
            settings as VisualizationSettings,
          );

          expect(isValid).toBe(false);
        });

        it("should return false when label is missing", () => {
          const comparison = {
            type: COMPARISON_TYPES.ANOTHER_COLUMN,
            column: "Count",
          };
          const settings = {
            "scalar.field": FIELD_NAME,
            "scalar.comparisons": [comparison],
          };

          const isValid = isComparisonValid(
            comparison as SmartScalarComparisonAnotherColumn,
            multiSeries,
            settings as VisualizationSettings,
          );

          expect(isValid).toBe(false);
        });

        it("should return false when comparison column is the same as primary number", () => {
          const comparison = {
            id: "1",
            type: COMPARISON_TYPES.ANOTHER_COLUMN,
            column: FIELD_NAME,
            label: "Count",
          };
          const settings = {
            "scalar.field": FIELD_NAME,
            "scalar.comparisons": [comparison],
          };

          const isValid = isComparisonValid(
            comparison,
            multiSeries,
            settings as VisualizationSettings,
          );

          expect(isValid).toBe(false);
        });

        it("should return false when column is missing in the series", () => {
          const comparison = {
            type: COMPARISON_TYPES.ANOTHER_COLUMN,
            label: "Missing",
            column: "Missing",
          };
          const settings = {
            "scalar.field": FIELD_NAME,
            "scalar.comparisons": [comparison],
          };

          const isValid = isComparisonValid(
            comparison as SmartScalarComparisonAnotherColumn,
            multiSeries,
            settings as VisualizationSettings,
          );

          expect(isValid).toBe(false);
        });
      });

      describe("static number comparison", () => {
        it("should return true when valid", () => {
          const comparison = {
            id: "1",
            type: COMPARISON_TYPES.STATIC_NUMBER,
            value: 100,
            label: "Goal",
          };
          const settings = {
            "scalar.field": FIELD_NAME,
            "scalar.comparisons": [comparison],
          };
          const rows = [
            ["2019-10-01", 100],
            ["2019-11-01", 300],
          ];
          const isValid = isComparisonValid(
            comparison as SmartScalarComparisonStaticNumber,
            series({ rows, insights: [] }),
            settings,
          );

          expect(isValid).toBeTruthy();
        });

        it("should return false when value is missing", () => {
          const comparison = {
            type: COMPARISON_TYPES.STATIC_NUMBER,
            label: "Goal",
          };
          const settings = {
            "scalar.field": FIELD_NAME,
            "scalar.comparisons": [comparison],
          };
          const rows = [
            ["2019-10-01", 100],
            ["2019-11-01", 300],
          ];

          const isValid = isComparisonValid(
            comparison as SmartScalarComparisonStaticNumber,
            series({ rows, insights: [] }),
            settings as VisualizationSettings,
          );

          expect(isValid).toBeFalsy();
        });

        it("should return false when label is missing", () => {
          const comparison = {
            type: COMPARISON_TYPES.STATIC_NUMBER,
            value: 100,
          };
          const settings = {
            "scalar.field": FIELD_NAME,
            "scalar.comparisons": [comparison],
          };
          const rows = [
            ["2019-10-01", 100],
            ["2019-11-01", 300],
          ];

          const isValid = isComparisonValid(
            comparison as SmartScalarComparisonStaticNumber,
            series({ rows, insights: [] }),
            settings as VisualizationSettings,
          );

          expect(isValid).toBeFalsy();
        });
      });
    });
  });

  describe("getValueWidth", () => {
    it("should not return negative values", () => {
      expect(getValueWidth(1)).toBeGreaterThanOrEqual(0);
      expect(getValueWidth(1)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getChangeWidth", () => {
    it("should not return negative values", () => {
      expect(getChangeWidth(1)).toBeGreaterThanOrEqual(0);
      expect(getChangeWidth(1)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("formatChangeAutoPrecision", () => {
    let measureTextSpy: jest.SpyInstance;

    beforeEach(() => {
      measureTextSpy = jest.spyOn(measureText, "measureText");
    });

    afterEach(() => {
      measureTextSpy.mockRestore();
    });

    it("should use maximum 2 fraction digits precision when text fits", () => {
      measureTextSpy.mockImplementationOnce(createMockMeasureText(100, 50));

      expect(
        formatChangeAutoPrecision(1.23456, getAutoPrecisionOptions(100)),
      ).toBe("123.46%");
    });

    it("should use 1 fraction digit when 2 digits don not fit", () => {
      measureTextSpy.mockImplementationOnce(createMockMeasureText(101, 50));
      measureTextSpy.mockImplementationOnce(createMockMeasureText(100, 50));

      expect(
        formatChangeAutoPrecision(1.23456, getAutoPrecisionOptions(100)),
      ).toBe("123.5%");
    });

    it("should use no fraction digits when they do not fit", () => {
      measureTextSpy.mockImplementationOnce(createMockMeasureText(103, 50));
      measureTextSpy.mockImplementationOnce(createMockMeasureText(102, 50));
      measureTextSpy.mockImplementationOnce(createMockMeasureText(101, 50));

      expect(
        formatChangeAutoPrecision(1.23456, getAutoPrecisionOptions(100)),
      ).toBe("123%");
    });
  });

  describe("formatChange", () => {
    it("should format as percentage", () => {
      expect(formatChange(-5)).toBe("500%");
      expect(formatChange(0)).toBe("0%");
      expect(formatChange(1)).toBe("100%");
      expect(formatChange(100)).toBe("10,000%");
    });

    it("should not keep the minus sign because UI has a dedicated icon for it", () => {
      expect(formatChange(-5)).toBe("500%");
    });

    it("should handle maximumFractionDigits parameter", () => {
      expect(formatChange(1.23456, { maximumFractionDigits: 2 })).toBe(
        "123.46%",
      );
      expect(formatChange(1.23456, { maximumFractionDigits: 1 })).toBe(
        "123.5%",
      );
      expect(formatChange(1.23456, { maximumFractionDigits: 0 })).toBe("123%");
    });
  });
});
