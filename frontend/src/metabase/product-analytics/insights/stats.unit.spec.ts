import {
  benjaminiHochberg,
  differencePValue,
  expectedPValue,
  interactionPValue,
  subtractCounts,
  twoProportionPValue,
} from "./stats";

describe("twoProportionPValue", () => {
  it("is 1 for identical rates", () => {
    expect(
      twoProportionPValue(
        { reached: 100, converted: 50 },
        { reached: 200, converted: 100 },
      ),
    ).toBeCloseTo(1, 6);
  });

  it("matches the normal approximation for different rates", () => {
    // pooled 0.5, se = 0.0707, z = 2.828
    expect(
      twoProportionPValue(
        { reached: 100, converted: 60 },
        { reached: 100, converted: 40 },
      ),
    ).toBeCloseTo(0.00468, 4);
  });

  it("stays accurate for very small p-values", () => {
    const pValue = twoProportionPValue(
      { reached: 1000, converted: 150 },
      { reached: 4000, converted: 1200 },
    );
    expect(pValue).toBeGreaterThan(0);
    expect(pValue).toBeLessThan(1e-15);
  });

  it("is 1 when a side is empty or nobody converts", () => {
    expect(
      twoProportionPValue(
        { reached: 0, converted: 0 },
        { reached: 100, converted: 10 },
      ),
    ).toBe(1);
    expect(
      twoProportionPValue(
        { reached: 100, converted: 0 },
        { reached: 100, converted: 0 },
      ),
    ).toBe(1);
  });
});

describe("benjaminiHochberg", () => {
  it("keeps every p-value up to the largest one under its threshold", () => {
    // thresholds at q = 0.1 with m = 5: 0.02, 0.04, 0.06, 0.08, 0.1
    expect(benjaminiHochberg([0.5, 0.01, 0.07, 0.03, 0.09], 0.1)).toEqual([
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it("keeps a p-value over its own threshold when a larger one is under its own", () => {
    // thresholds at q = 0.1 with m = 2: 0.05, 0.1
    expect(benjaminiHochberg([0.06, 0.07], 0.1)).toEqual([true, true]);
  });

  it("keeps nothing when no p-value is under its threshold", () => {
    expect(benjaminiHochberg([0.5, 0.6], 0.1)).toEqual([false, false]);
  });
});

describe("interactionPValue", () => {
  it("finds no interaction when the effects multiply the odds independently", () => {
    // Odds: neither 1, A doubles, B triples, both × 6.
    expect(
      interactionPValue({
        both: { reached: 700, converted: 600 },
        onlyA: { reached: 1500, converted: 1000 },
        onlyB: { reached: 1600, converted: 1200 },
        neither: { reached: 2000, converted: 1000 },
      }),
    ).toBeGreaterThan(0.5);
  });

  it("finds an interaction when the combination behaves differently", () => {
    expect(
      interactionPValue({
        both: { reached: 300, converted: 15 },
        onlyA: { reached: 2000, converted: 500 },
        onlyB: { reached: 2300, converted: 560 },
        neither: { reached: 16000, converted: 4000 },
      }),
    ).toBeLessThan(1e-6);
  });
});

describe("expected outcomes", () => {
  it("is 1 when a group has as many outcomes as expected", () => {
    expect(
      expectedPValue({
        reached: 100,
        converted: 50,
        expected: { outcomes: 50, variance: 25 },
      }),
    ).toBeCloseTo(1, 6);
  });

  it("tests the outcomes against the expected ones", () => {
    // z = (60 - 50) / sqrt(25) = 2
    expect(
      expectedPValue({
        reached: 100,
        converted: 60,
        expected: { outcomes: 50, variance: 25 },
      }),
    ).toBeCloseTo(0.0455, 4);
  });

  it("compares how far two groups beat what's expected of them", () => {
    // Different rates, but each beats its own expectation by 10 points.
    const busy = {
      reached: 100,
      converted: 90,
      expected: { outcomes: 80, variance: 16 },
    };
    const quiet = {
      reached: 100,
      converted: 30,
      expected: { outcomes: 20, variance: 16 },
    };

    expect(differencePValue(busy, quiet)).toBeCloseTo(1, 6);
    expect(differencePValue(busy, { ...quiet, converted: 10 })).toBeLessThan(
      0.05,
    );
  });

  it("subtracts expected outcomes with the counts", () => {
    expect(
      subtractCounts(
        {
          reached: 100,
          converted: 60,
          expected: { outcomes: 50, variance: 25 },
        },
        {
          reached: 40,
          converted: 30,
          expected: { outcomes: 20, variance: 10 },
        },
      ),
    ).toEqual({
      reached: 60,
      converted: 30,
      expected: { outcomes: 30, variance: 15 },
    });
  });
});
