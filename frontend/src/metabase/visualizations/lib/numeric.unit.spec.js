import {
  precision,
  computeNumericDataInverval,
  isMultipleOf,
  computeChange,
} from "metabase/visualizations/lib/numeric";

describe("visualization.lib.numeric", () => {
  describe("precision", () => {
    const CASES = [
      [0, 0],
      [10, 10],
      [-10, 10],
      [1, 1],
      [-1, 1],
      [0.1, 0.1],
      [-0.1, 0.1],
      [0.01, 0.01],
      [-0.01, 0.01],
      [1.1, 0.1],
      [-1.1, 0.1],
      [0.5, 0.1],
      [0.9, 0.1],
      [-0.5, 0.1],
      [-0.9, 0.1],
      [1.23, 0.01],
      [1.234, 1e-3],
      [1.2345, 1e-4],
      [1.23456, 1e-5],
      [1.234567, 1e-6],
      [1.2345678, 1e-7],
      [1.23456789, 1e-8],
      [-1.23456789, 1e-8],
      [-1.2345678912345, 1e-13],
      [-1.23456789123456, 1e-14],
      // very precise numbers are cut off at 10^-14
      [-1.23456789123456789123456789, 1e-14],
    ];
    for (const [n, p] of CASES) {
      it(`precision of ${n} should be ${p}`, () => {
        expect(Math.abs(precision(n) - p) < Number.EPSILON).toBe(true);
        // The expect above doesn't print out the relevant values for failures.
        // The next line fails but can be useful when debugging.
        // expect(precision(n)).toBe(p);
      });
    }
  });
  describe("computeNumericDataInverval", () => {
    const CASES = [
      [[0], 1],
      [[1], 1],
      [[0, 1], 1],
      [[0.1, 1], 0.1],
      [[0.1, 10], 0.1],
      [[10, 1], 1],
      [[0, null, 1], 1],
    ];
    for (const c of CASES) {
      it("precision of " + c[0] + " should be " + c[1], () => {
        expect(computeNumericDataInverval(c[0])).toEqual(c[1]);
      });
    }
  });
  describe("isMultipleOf", () => {
    [
      [1, 0.1, true],
      [1, 1, true],
      [10, 1, true],
      [1, 10, false],
      [3, 1, true],
      [0.3, 0.1, true],
      [0.25, 0.1, false],
      [0.000000001, 0.0000000001, true],
      [0.0000000001, 0.000000001, false],
      [100, 1e-14, true],
    ].map(([value, base, expected]) =>
      it(`${value} ${expected ? "is" : "is not"} a multiple of ${base}`, () =>
        expect(isMultipleOf(value, base)).toBe(expected)),
    );

    // With the current implementation this is guaranteed to be true. This test
    // is left in incase that implementation changes.
    [123456.123456, -123456.123456, 1.23456789, -1.23456789].map(value =>
      it(`${value} should be a multiple of its precision (${precision(
        value,
      )})`, () => expect(isMultipleOf(value, precision(value))).toBe(true)),
    );
  });

  describe("computeChange", () => {
    describe("comparisonVal = 0", () => {
      const cases = [
        {
          description: "should evaluate: 0 → < 0 = -∞%",
          subCases: [
            {
              previous: 0,
              next: -1,
              expected: -Infinity,
            },
            {
              previous: 0,
              next: -10,
              expected: -Infinity,
            },
          ],
        },
        {
          description: "should evaluate: 0 → > 0 = ∞%",
          subCases: [
            {
              previous: 0,
              next: 1,
              expected: Infinity,
            },
            {
              previous: 0,
              next: 10,
              expected: Infinity,
            },
          ],
        },
        {
          description: "should evaluate: 0 → 0 =  0%",
          subCases: [
            {
              previous: 0,
              next: 0,
              expected: 0,
            },
          ],
        },
      ];

      describe.each(cases)("$description", ({ subCases }) => {
        it.each(subCases)(
          "$previous -> $next = $expected",
          ({ previous, next, expected }) => {
            expect(computeChange(previous, next)).toBe(expected);
          },
        );
      });
    });

    describe("comparisonVal < 0", () => {
      const cases = [
        {
          description: "should evaluate: - → 0 = 100%",
          subCases: [
            {
              previous: -1,
              next: 0,
              expected: 1,
            },
            {
              previous: -10,
              next: 0,
              expected: 1,
            },
          ],
        },
        {
          description:
            "should evaluate: - → - =  (currVal - comparisonVal) / Math.abs(comparisonVal)",
          subCases: [
            {
              previous: -3,
              next: -5,
              expected: -2 / 3,
            },
            {
              previous: -12,
              next: -3,
              expected: 9 / 12,
            },
          ],
        },
        {
          description:
            "should evaluate: - → + = (currVal - comparisonVal) / Math.abs(comparisonVal)",
          subCases: [
            {
              previous: -3,
              next: 5,
              expected: 8 / 3,
            },
            {
              previous: -12,
              next: 3,
              expected: 15 / 12,
            },
          ],
        },
      ];

      describe.each(cases)("$description", ({ subCases }) => {
        it.each(subCases)(
          "$previous -> $next = $expected",
          ({ previous, next, expected }) => {
            expect(computeChange(previous, next)).toBe(expected);
          },
        );
      });
    });

    describe("comparisonVal > 0", () => {
      const cases = [
        {
          description: "should evaluate: + → 0 = -100%",
          subCases: [
            {
              previous: 1,
              next: 0,
              expected: -1,
            },
            {
              previous: 10,
              next: 0,
              expected: -1,
            },
          ],
        },
        {
          description:
            "should evaluate: + → + = (currVal - comparisonVal) / Math.abs(comparisonVal)",
          subCases: [
            {
              previous: 3,
              next: 5,
              expected: 2 / 3,
            },
            {
              previous: 12,
              next: 3,
              expected: -9 / 12,
            },
          ],
        },
        {
          description:
            "should evaluate: + → - = (currVal - comparisonVal) / Math.abs(comparisonVal)",
          subCases: [
            {
              previous: 3,
              next: -5,
              expected: -8 / 3,
            },
            {
              previous: 12,
              next: -3,
              expected: -15 / 12,
            },
          ],
        },
      ];

      describe.each(cases)("$description", ({ subCases }) => {
        it.each(subCases)(
          "$previous -> $next = $expected",
          ({ previous, next, expected }) => {
            expect(computeChange(previous, next)).toBe(expected);
          },
        );
      });
    });
  });
});
