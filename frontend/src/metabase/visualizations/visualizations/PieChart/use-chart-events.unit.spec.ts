jest.mock("metabase/utils/formatting/currency", () => ({
  currency: [],
}));

jest.mock("metabase/visualizations/shared/settings/pie", () => ({
  getValueFromDimensionKey: (key: string) => key,
  getPieDimensions: () => [],
  getPieRows: () => [],
  getPieSortRowsDimensionSetting: () => null,
  getDefaultPieColumns: () => ({}),
  getDefaultSortRows: () => false,
  getDefaultSliceThreshold: () => 0.05,
  getDefaultShowLegend: () => true,
  getDefaultShowTotal: () => true,
  getDefaultShowLabels: () => true,
  getDefaultPercentVisibility: () => "legend",
}));

import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";

import { getTooltipModel } from "./use-chart-events";

const mockColumn = {
  display_name: "Product → Category",
  name: "CATEGORY",
} as any;

const mockSliceTree = new Map([
  [
    "Widget",
    {
      key: "Widget",
      name: "Widget",
      value: 100,
      rawValue: 100,
      normalizedPercentage: 0.25,
      visible: true,
      color: "#509EE3",
      startAngle: 0,
      endAngle: 90,
      children: new Map(),
      column: mockColumn,
      legendHoverIndex: 0,
      isOther: false,
      includeInLegend: true,
    },
  ],
]) as any;

const mockChartModel: PieChartModel = {
  sliceTree: mockSliceTree,
  total: 400,
  numRings: 1,
  colDescs: {
    metricDesc: { index: 1, column: {} as any },
    dimensionDesc: { index: 0, column: mockColumn },
  },
};

const mockFormatters: PieChartFormatters = {
  formatMetric: (value: unknown) => String(value),
  formatPercent: (value: unknown) => `${Number(value) * 100}%`,
};

describe("getTooltipModel", () => {
  it("uses display_name when no column title setting is defined", () => {
    const settings = { column: () => ({}) };
    const result = getTooltipModel(
      ["Widget"],
      mockChartModel,
      mockFormatters,
      settings as any,
    );
    expect(result.header).toBe("Product → Category");
  });

  it("uses custom column title when defined in settings", () => {
    const settings = {
      column: () => ({ column_title: "Test" }),
    };
    const result = getTooltipModel(
      ["Widget"],
      mockChartModel,
      mockFormatters,
      settings as any,
    );
    expect(result.header).toBe("Test");
  });
});
