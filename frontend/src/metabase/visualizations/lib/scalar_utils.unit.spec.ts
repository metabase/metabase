import { TYPE } from "metabase-lib/v1/types/constants";

import {
  compactifyValue,
  COMPACT_WIDTH_PER_DIGIT,
  COMPACT_MAX_WIDTH,
  COMPACT_MIN_LENGTH,
} from "./scalar_utils";

describe("scalar utils", () => {
  describe("compactifyValue", () => {
    const formatOptions = {
      column: {
        base_type: TYPE.Number,
        semantic_type: TYPE.Number,
      },
    };

    it("displayValue is fullScalarValue when fullScalarValue.length <= COMPACT_MIN_LENGTH", () => {
      const value = 45000;
      const width = 200;

      const { displayValue, fullScalarValue } = compactifyValue(
        value,
        width,
        formatOptions,
      ) as { displayValue: string; fullScalarValue: string };

      expect(fullScalarValue.length).toBeLessThanOrEqual(COMPACT_MIN_LENGTH);

      expect(displayValue).toBe(fullScalarValue);
      expect(fullScalarValue).toBe("45,000");
    });

    it("displayValue is compact when fullScalarValue.length > COMPACT_MIN_LENGTH and width < COMPACT_MAX_WIDTH", () => {
      const value = 45000.1343;
      const width = 200;

      const { displayValue, fullScalarValue } = compactifyValue(
        value,
        width,
        formatOptions,
      ) as { displayValue: string; fullScalarValue: string };

      expect(fullScalarValue.length).toBeGreaterThan(COMPACT_MIN_LENGTH);
      expect(width).toBeLessThan(COMPACT_MAX_WIDTH);

      expect(displayValue).not.toBe(fullScalarValue);
      expect(displayValue).toBe("45.0k");
    });

    it("displayValue is compact when fullScalarValue.length > COMPACT_MIN_LENGTH & width >= COMPACT_MAX_WIDTH & width < COMPACT_WIDTH_PER_DIGIT * fullScalarValue.length", () => {
      const value = 100100100100;
      const width = 350;

      const { displayValue, fullScalarValue } = compactifyValue(
        value,
        width,
        formatOptions,
      ) as { displayValue: string; fullScalarValue: string };

      expect(fullScalarValue.length).toBeGreaterThan(COMPACT_MIN_LENGTH);
      expect(width).toBeGreaterThanOrEqual(COMPACT_MAX_WIDTH);
      expect(width).toBeLessThan(
        fullScalarValue.length * COMPACT_WIDTH_PER_DIGIT,
      );

      expect(displayValue).not.toBe(fullScalarValue);
      expect(displayValue).toBe("100.1B");
    });

    it("displayValue is not compact when fullScalarValue.length > COMPACT_MIN_LENGTH & width >= COMPACT_MAX_WIDTH & width >= COMPACT_WIDTH_PER_DIGIT * fullScalarValue.length", () => {
      const value = 10010010010;
      const width = 350;

      const { displayValue, fullScalarValue } = compactifyValue(
        value,
        width,
        formatOptions,
      ) as { displayValue: string; fullScalarValue: string };

      expect(fullScalarValue.length).toBeGreaterThan(COMPACT_MIN_LENGTH);
      expect(width).toBeGreaterThanOrEqual(COMPACT_MAX_WIDTH);
      expect(width).toBeGreaterThanOrEqual(
        fullScalarValue.length * COMPACT_WIDTH_PER_DIGIT,
      );

      expect(displayValue).toBe(fullScalarValue);
      expect(displayValue).toBe("10,010,010,010");
    });

    it("displayValue is always compact when formatOptions.compact is true", () => {
      const value = 10010010010;
      const width = 350;

      const { displayValue, fullScalarValue } = compactifyValue(value, width, {
        ...formatOptions,
        compact: true,
      }) as { displayValue: string; fullScalarValue: string };

      expect(displayValue).toBe("10.0B");
      expect(fullScalarValue).toBe("10,010,010,010");
    });
  });
});
