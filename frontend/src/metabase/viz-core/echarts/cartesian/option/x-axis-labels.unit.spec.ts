import { getXAxisLabelValues } from "./x-axis-labels";

const getOptions = (valuesCount = 5) => ({
  valuesCount,
  getValue: (index: number) => index,
  getPosition: (value: number) => 48 + (value / (valuesCount - 1)) * 304,
  formatLabel: String,
  getLabelWidth: (text: string) => text.length * 6,
  axisWidth: 400,
  padding: 16,
});

describe("getXAxisLabelValues", () => {
  it("keeps fitting labels and both edge-aligned endpoints", () => {
    expect(getXAxisLabelValues(getOptions())).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps short labels after rejecting a long interior label (UXW-5182)", () => {
    const labels = [
      "First endpoint is long",
      "A very long interior label that cannot fit within the whole chart".repeat(
        10,
      ),
      "Short",
      "Next",
      "Last endpoint is long",
    ];
    expect(
      getXAxisLabelValues({
        ...getOptions(),
        axisWidth: 900,
        padding: 24,
        getPosition: (value) => 100 + (value / 4) * 700,
        formatLabel: (value) => labels[value],
      }),
    ).toEqual([0, 2, 3, 4]);
  });

  it("reserves the last endpoint before selecting nearby interior labels (UXW-5182)", () => {
    expect(
      getXAxisLabelValues({
        ...getOptions(),
        getPosition: (value) => [48, 100, 220, 340, 352][value],
        formatLabel: (value) => (value === 4 ? "Last endpoint" : String(value)),
      }),
    ).toEqual([0, 1, 2, 4]);
  });

  it("omits repeated formatted interiors without dropping endpoints (UXW-5182)", () => {
    const labels = ["Jan", "Feb", "Feb", "Oct", "Oct"];
    expect(
      getXAxisLabelValues({
        ...getOptions(),
        deduplicateLabels: true,
        formatLabel: (value) => labels[value],
      }),
    ).toEqual([0, 1, 4]);
  });

  it("keeps distinct categories that share the same formatted label (UXW-5182)", () => {
    const categories = ["one", "ONE", "One", "oNe", "onE"];
    const getLabelWidth = jest.fn(() => 18);
    expect(
      getXAxisLabelValues({
        ...getOptions(),
        formatLabel: (value) => categories[value].toUpperCase(),
        getLabelWidth,
      }),
    ).toEqual([0, 1, 2, 3, 4]);
    expect(getLabelWidth).toHaveBeenCalledTimes(1);
  });

  it("preserves both endpoints when their formatted values match", () => {
    const getLabelWidth = jest.fn(() => 30);
    expect(
      getXAxisLabelValues({
        ...getOptions(),
        deduplicateLabels: true,
        formatLabel: () => "Same",
        getLabelWidth,
      }),
    ).toEqual([0, 4]);
    expect(getLabelWidth).toHaveBeenCalledTimes(1);
  });

  it("bounds category formatting and measurement without scanning all 10000 values (UXW-5182)", () => {
    const getValue = jest.fn((index: number) => index);
    const formatLabel = jest.fn(String);
    const getLabelWidth = jest.fn((text: string) => text.length * 6);
    const selected = getXAxisLabelValues({
      ...getOptions(10000),
      getValue,
      formatLabel,
      getLabelWidth,
    });

    expect(selected?.[0]).toBe(0);
    expect(selected?.[selected.length - 1]).toBe(9999);
    expect(getValue.mock.calls.length).toBeLessThanOrEqual(50);
    expect(formatLabel.mock.calls.length).toBeLessThanOrEqual(50);
    expect(getLabelWidth.mock.calls.length).toBeLessThanOrEqual(50);
  });

  it("selects the same labels on repeated layout passes", () => {
    const options = getOptions(10000);
    expect(getXAxisLabelValues(options)).toEqual(getXAxisLabelValues(options));
  });

  it("falls back when the two endpoint text boxes overlap", () => {
    expect(
      getXAxisLabelValues({ ...getOptions(), axisWidth: 40 }),
    ).toBeUndefined();
  });

  it.each([0, 1])("falls back for %i values", (valuesCount) => {
    expect(getXAxisLabelValues(getOptions(valuesCount))).toBeUndefined();
  });
});
