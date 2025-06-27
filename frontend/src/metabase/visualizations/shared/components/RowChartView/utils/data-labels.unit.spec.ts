import { scaleLinear } from "d3-scale";

import type { BarData } from "../../RowChart/types";

import { getDataLabel } from "./data-labels";

describe("getDataLabel", () => {
  const mockXScale = scaleLinear().domain([0, 100]).range([0, 500]);
  const seriesKey = "test-series";

  const createBarData = <T>(overrides: Partial<BarData<T>> = {}): BarData<T> =>
    ({
      xStartValue: 10,
      xEndValue: 50,
      isNegative: false,
      isBorderValue: false,
      ...overrides,
    }) as any;

  it("returns null when value is null", () => {
    const bar = createBarData({ xEndValue: null });
    const result = getDataLabel(bar, mockXScale, seriesKey);
    expect(result).toBeNull();
  });

  it("returns null when value is out of domain (below)", () => {
    const bar = createBarData({ xEndValue: -10 });
    const result = getDataLabel(bar, mockXScale, seriesKey);
    expect(result).toBeNull();
  });

  it("returns null when value is out of domain (above)", () => {
    const bar = createBarData({ xEndValue: 150 });
    const result = getDataLabel(bar, mockXScale, seriesKey);
    expect(result).toBeNull();
  });

  it("returns null when series is not in labelledSeries", () => {
    const bar = createBarData();
    const result = getDataLabel(bar, mockXScale, seriesKey, false, [
      "other-series",
    ]);
    expect(result).toBeNull();
  });

  it("returns null when labelledSeries is null", () => {
    const bar = createBarData();
    const result = getDataLabel(bar, mockXScale, seriesKey, false, null);
    expect(result).toBeNull();
  });

  it("returns value for positive bar when conditions are met", () => {
    const bar = createBarData({ xEndValue: 75 });
    const result = getDataLabel(bar, mockXScale, seriesKey, false, [seriesKey]);
    expect(result).toBe(75);
  });

  it("returns xStartValue for negative bar", () => {
    const bar = createBarData({
      xStartValue: 25,
      xEndValue: 75,
      isNegative: true,
    });
    const result = getDataLabel(bar, mockXScale, seriesKey, false, [seriesKey]);
    expect(result).toBe(25);
  });

  it("returns null for stacked bar that is not border value", () => {
    const bar = createBarData({ isBorderValue: false });
    const result = getDataLabel(bar, mockXScale, seriesKey, true, [seriesKey]);
    expect(result).toBeNull();
  });

  it("returns value for stacked bar that is border value", () => {
    const bar = createBarData({
      xEndValue: 60,
      isBorderValue: true,
    });
    const result = getDataLabel(bar, mockXScale, seriesKey, true, [seriesKey]);
    expect(result).toBe(60);
  });

  it("returns value for non-stacked bar regardless of border value", () => {
    const bar = createBarData({
      xEndValue: 40,
      isBorderValue: false,
    });
    const result = getDataLabel(bar, mockXScale, seriesKey, false, [seriesKey]);
    expect(result).toBe(40);
  });

  it("handles edge case where value equals domain boundary (metabase#59507)", () => {
    const bar = createBarData({ xEndValue: 100 }); // equals domain end
    const result = getDataLabel(bar, mockXScale, seriesKey, false, [seriesKey]);
    expect(result).toBe(100);
  });
});
