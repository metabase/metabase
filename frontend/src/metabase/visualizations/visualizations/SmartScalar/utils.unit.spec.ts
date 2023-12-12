import * as measureText from "metabase/lib/measure-text";
import type { FontStyle } from "metabase/visualizations/shared/types/measure-text";

import type { DatetimeUnit, Insight, RowValues } from "metabase-types/api";
import {
  createMockColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";
import { DateTimeColumn, NumberColumn } from "__support__/visualizations";
import {
  COMPARISON_SELECTOR_OPTIONS,
  COMPARISON_TYPES,
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
    const createInsights = (dateUnit: DatetimeUnit) => [
      { unit: dateUnit, col: FIELD_NAME },
    ];
    const cols = [
      createMockColumn(DateTimeColumn({ name: "Month" })),
      createMockColumn(NumberColumn({ name: "Count" })),
    ];
    const series = ({
      rows,
      insights,
    }: {
      rows: RowValues[];
      insights: Insight[] | undefined;
    }) => [createMockSingleSeries({}, { data: { cols, rows, insights } })];

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

        expect(defaultComparison).toBe(
          COMPARISON_SELECTOR_OPTIONS.PREVIOUS_VALUE,
        );
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

        expect(defaultComparison).toEqual({
          type: COMPARISON_TYPES.PREVIOUS_PERIOD,
          name: "Previous month",
        });
      });
    });

    describe("getComparisonOptions", () => {
      const settings = {
        "scalar.field": FIELD_NAME,
      };
      it("should return only previousValue option if no dateUnit", () => {
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
        ]);
      });

      it("should return only previousValue and previousPeriod if dateUnit is supplied but dataset only ranges 1 period in the past", () => {
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
        ]);
      });

      it("should return all options if dateUnit is supplied and dataset ranges more than 1 period in the past", () => {
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
            MenuItemComponent:
              COMPARISON_SELECTOR_OPTIONS.PERIODS_AGO.MenuItemComponent,
          },
          COMPARISON_SELECTOR_OPTIONS.PREVIOUS_VALUE,
        ]);
      });
    });

    describe("isComparisonValid", () => {
      it("should always return true if type is previousValue comparison", () => {
        const settings = {
          "scalar.field": FIELD_NAME,
          "scalar.comparisons": { type: COMPARISON_TYPES.PREVIOUS_VALUE },
        };
        const rows = [
          ["2019-10-01", 100],
          ["2019-11-01", 300],
        ];
        const isValid = isComparisonValid(
          series({ rows, insights: [] }),
          settings,
        );

        expect(isValid).toBeTruthy();
      });

      it("should return false if no dateUnit", () => {
        const settings = {
          "scalar.field": FIELD_NAME,
        };
        const rows = [
          ["2019-10-01", 100],
          ["2019-11-01", 300],
        ];
        const isValid = isComparisonValid(
          series({ rows, insights: [] }),
          settings,
        );

        expect(isValid).toBeFalsy();
      });

      it("should return true if dateUnit is supplied", () => {
        const settings = {
          "scalar.field": FIELD_NAME,
        };
        const rows = [
          ["2019-10-01", 100],
          ["2019-11-01", 300],
        ];
        const insights = createInsights("month");
        const isValid = isComparisonValid(series({ rows, insights }), settings);

        expect(isValid).toBeTruthy();
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
