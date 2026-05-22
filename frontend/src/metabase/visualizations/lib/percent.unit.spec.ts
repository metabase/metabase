import { reconcilePercentagesIfNeeded } from "./percent";

// Format reconciled fractions the way the charts do, so assertions read in the
// user-facing units (percent strings at the given precision).
const asPercents = (shares: number[], decimals: number) =>
  shares.map((share) => (share * 100).toFixed(decimals));

// Exact integer total of the displayed units (e.g. 10000 for 100% at 2 dp).
// Uses integer arithmetic to avoid float noise in the assertion itself.
const totalUnits = (shares: number[], decimals: number) =>
  shares.reduce(
    (sum, share) => sum + Math.round(share * 100 * Math.pow(10, decimals)),
    0,
  );

describe("reconcilePercentagesIfNeeded", () => {
  describe("basic reconciliation", () => {
    it("nudges equal thirds so they sum to exactly 100% (2 dp)", () => {
      const result = reconcilePercentagesIfNeeded([1 / 3, 1 / 3, 1 / 3], 2);
      expect(asPercents(result, 2)).toEqual(["33.34", "33.33", "33.33"]);
      expect(totalUnits(result, 2)).toBe(10000);
    });

    it("works at integer precision (0 dp)", () => {
      const result = reconcilePercentagesIfNeeded([1 / 3, 1 / 3, 1 / 3], 0);
      expect(asPercents(result, 0)).toEqual(["34", "33", "33"]);
      expect(totalUnits(result, 0)).toBe(100);
    });

    it("works at higher precision (4 dp)", () => {
      const result = reconcilePercentagesIfNeeded([1 / 3, 1 / 3, 1 / 3], 4);
      expect(asPercents(result, 4)).toEqual(["33.3334", "33.3333", "33.3333"]);
      expect(totalUnits(result, 4)).toBe(1000000);
    });

    it("corrects an over-rounding set", () => {
      // Sixths sum to 100.2% naively; the first four buckets absorb the trim

      const result = reconcilePercentagesIfNeeded(Array(6).fill(1 / 6), 2);
      expect(asPercents(result, 2)).toEqual([
        "16.67",
        "16.67",
        "16.67",
        "16.67",
        "16.66",
        "16.66",
      ]);
      expect(totalUnits(result, 2)).toBe(10000);
    });

    it("handles an asymmetric set that rounds up past 100% (0 dp)", () => {
      // 30.6 / 30.6 / 38.8 would naively round to 31 / 31 / 39 = 101%
      const result = reconcilePercentagesIfNeeded([0.306, 0.306, 0.388], 0);
      expect(asPercents(result, 0)).toEqual(["31", "30", "39"]);
      expect(totalUnits(result, 0)).toBe(100);
    });
  });

  describe("tie-break: the first record wins", () => {
    it("awards the single leftover unit to the first of equal remainders", () => {
      // all three remainders are equal (0.333…) -> the first gets the +1
      const result = reconcilePercentagesIfNeeded([1 / 3, 1 / 3, 1 / 3], 0);
      expect(asPercents(result, 0)).toEqual(["34", "33", "33"]);
    });

    it("awards multiple leftover units to the first records in order", () => {
      // six equal sixths: 4 leftover units -> the first four are bumped, last two stay
      const result = reconcilePercentagesIfNeeded(Array(6).fill(1 / 6), 2);
      expect(asPercents(result, 2)).toEqual([
        "16.67",
        "16.67",
        "16.67",
        "16.67",
        "16.66",
        "16.66",
      ]);
    });
  });

  describe("floating-point robustness", () => {
    it("snapping keeps genuine ties equal so the tie-break stays predictable", () => {
      // 2/12 and 5/12 share the fractional remainder .666…; raw float makes the
      // 2/12 bucket's remainder come out microscopically smaller, so without
      // snapping it would lose its tie. Snapping restores equality -> the first
      // records win the two leftover units.
      const result = reconcilePercentagesIfNeeded([2 / 12, 5 / 12, 5 / 12], 0);
      // would be ["16","42","42"] if the float tie were resolved the wrong way
      expect(asPercents(result, 0)).toEqual(["17", "42", "41"]);
    });

    it("reconciles a genuine whole whose float sum isn't exactly 1", () => {
      // sevenths sum to 0.9999999999999998 in float, not 1 — the self-gate
      // must still recognize them as a complete whole.
      const result = reconcilePercentagesIfNeeded(Array(7).fill(1 / 7), 2);
      expect(totalUnits(result, 2)).toBe(10000);
    });
  });

  describe("self-gating: only reconciles a complete whole", () => {
    it("leaves a sub-100% set untouched (e.g. Sankey flow loss)", () => {
      const input = [0.4, 0.4]; // sums to 80%
      const result = reconcilePercentagesIfNeeded(input, 2);
      expect(result).toEqual([0.4, 0.4]);
    });

    it("gating depends on the display precision", () => {
      const input = [0.4, 0.3, 0.297]; // sums to 99.7%

      // At 0 dp, 99.7% rounds to 100% -> reconciled (the .7 bucket rounds up).
      expect(asPercents(reconcilePercentagesIfNeeded(input, 0), 0)).toEqual([
        "40",
        "30",
        "30",
      ]);

      // At 2 dp, 99.70% does not round to 100% -> left as-is.
      const at2dp = reconcilePercentagesIfNeeded(input, 2);
      expect(at2dp).toEqual(input);
      expect(asPercents(at2dp, 2)).toEqual(["40.00", "30.00", "29.70"]);
    });

    it("leaves a set summing above 100% untouched", () => {
      const input = [0.5, 0.5, 0.01]; // sums to 101%
      expect(reconcilePercentagesIfNeeded(input, 2)).toEqual(input);
    });
  });

  describe("order and immutability", () => {
    it("preserves input order in the output", () => {
      const result = reconcilePercentagesIfNeeded([0.5, 1 / 3, 1 / 6], 2);
      // 50% stays first; the smaller buckets follow in their original positions
      expect(asPercents(result, 2)).toEqual(["50.00", "33.33", "16.67"]);
      expect(totalUnits(result, 2)).toBe(10000);
    });

    it("does not mutate the input array", () => {
      const input = [1 / 3, 1 / 3, 1 / 3];
      const snapshot = [...input];
      reconcilePercentagesIfNeeded(input, 2);
      expect(input).toEqual(snapshot);
    });

    it("returns a new array even on passthrough", () => {
      const input = [0.4, 0.4]; // not a whole -> passthrough
      const result = reconcilePercentagesIfNeeded(input, 2);
      expect(result).toEqual(input);
      expect(result).not.toBe(input);
    });
  });

  describe("edge cases", () => {
    it("returns an empty array for empty input", () => {
      expect(reconcilePercentagesIfNeeded([], 2)).toEqual([]);
    });

    it("reconciles a single complete share", () => {
      expect(reconcilePercentagesIfNeeded([1], 2)).toEqual([1]);
    });

    it("passes a single incomplete share through", () => {
      expect(reconcilePercentagesIfNeeded([0.5], 2)).toEqual([0.5]);
    });

    it("passes an all-zero set through (not a whole)", () => {
      expect(reconcilePercentagesIfNeeded([0, 0, 0], 0)).toEqual([0, 0, 0]);
    });

    it("treats non-finite shares as 0 when the rest forms a whole", () => {
      const result = reconcilePercentagesIfNeeded([0.5, 0.5, NaN], 2);
      expect(asPercents(result, 2)).toEqual(["50.00", "50.00", "0.00"]);
      expect(totalUnits(result, 2)).toBe(10000);
    });

    it("passes an all-NaN set through unchanged", () => {
      expect(reconcilePercentagesIfNeeded([NaN, NaN], 2)).toEqual([NaN, NaN]);
    });
  });

  describe("invalid decimals are a no-op (returns a copy)", () => {
    it.each([
      ["NaN", NaN],
      ["Infinity", Infinity],
      ["negative", -1],
      ["non-integer", 2.5],
    ])("returns the shares unchanged for %s", (_label, decimals: number) => {
      const input = [1 / 3, 1 / 3, 1 / 3];
      const result = reconcilePercentagesIfNeeded(input, decimals);
      expect(result).toEqual(input);
      expect(result).not.toBe(input);
    });
  });
});
