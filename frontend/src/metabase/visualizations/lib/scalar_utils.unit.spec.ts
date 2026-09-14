import { TYPE } from "metabase-lib/v1/types/constants";

import { compactifyValue, estimateScalarValueWidth } from "./scalar_utils";

describe("scalar utils", () => {
  describe("compactifyValue", () => {
    const fontSize = 32;
    const formatOptions = {
      column: {
        base_type: TYPE.Number,
        semantic_type: TYPE.Number,
      },
    };

    it("displayValue is fullScalarValue when the value fits the width", () => {
      const value = 45000.1343;
      const width = 200;

      // Unjustified type cast. FIXME
      const { displayValue, fullScalarValue } = compactifyValue(
        value,
        width,
        fontSize,
        formatOptions,
      ) as { displayValue: string; fullScalarValue: string };

      expect(displayValue).toBe(fullScalarValue);
      expect(fullScalarValue).toBe("45,000.13");
    });

    it("displayValue is compact when the value does not fit the width", () => {
      const value = 45000.1343;
      const width = 140;

      // Unjustified type cast. FIXME
      const { displayValue, fullScalarValue } = compactifyValue(
        value,
        width,
        fontSize,
        formatOptions,
      ) as { displayValue: string; fullScalarValue: string };

      expect(displayValue).not.toBe(fullScalarValue);
      expect(displayValue).toBe("45.0k");
    });

    it("displayValue is compact when formatOptions request it regardless of width", () => {
      const value = 45000.1343;
      const width = 1000;

      // Unjustified type cast. FIXME
      const { displayValue } = compactifyValue(value, width, fontSize, {
        ...formatOptions,
        compact: true,
      }) as { displayValue: string };

      expect(displayValue).toBe("45.0k");
    });
  });

  describe("estimateScalarValueWidth", () => {
    it("should count locale digit separators as thin characters", () => {
      const plain = estimateScalarValueWidth("68000", 32);
      // Swiss apostrophe, no-break space, and narrow no-break space grouping
      for (const separator of ["’", " ", " ", ","]) {
        const grouped = estimateScalarValueWidth(`68${separator}000`, 32);
        expect(grouped - plain).toBeLessThan(0.3 * 32);
      }
    });
  });
});
