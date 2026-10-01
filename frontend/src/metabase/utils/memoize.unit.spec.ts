import { memoize } from "metabase/utils/memoize";

class Chart {
  series = memoize(() => ({ rows: [1, 2, 3] }));

  slice = memoize((index: number, options: { label: string }) => ({
    index,
    label: options.label,
  }));
}

describe("a memoized class field", () => {
  it("returns the identical result for one instance", () => {
    const chart = new Chart();

    expect(chart.series()).toBe(chart.series());
  });

  it("keeps instances apart", () => {
    expect(new Chart().series()).not.toBe(new Chart().series());
  });

  it("keys on every argument", () => {
    const chart = new Chart();
    const options = { label: "first" };

    expect(chart.slice(1, options)).toBe(chart.slice(1, options));
    expect(chart.slice(1, options)).not.toBe(chart.slice(2, options));
    expect(chart.slice(1, options)).not.toBe(
      chart.slice(1, { label: "first" }),
    );
  });
});
