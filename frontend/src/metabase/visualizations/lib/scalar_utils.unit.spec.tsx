import { render, screen } from "__support__/ui";
import { color } from "metabase/ui/utils/colors";
import { TYPE } from "metabase-lib/v1/types/constants";

import type { ResolvedOpenEndedGoalSegment } from "./dynamic-goals";
import {
  COMPACT_MAX_WIDTH,
  COMPACT_MIN_LENGTH,
  COMPACT_WIDTH_PER_DIGIT,
  compactifyValue,
  getColor,
  getTooltipContent,
} from "./scalar_utils";

const SEGMENTS: ResolvedOpenEndedGoalSegment[] = [
  { min: null, max: 10, color: "red", label: "low" },
  { min: 10, max: 100, color: "yellow", label: "mid" },
  { min: 100, max: null, color: "green", label: "high" },
];

describe("scalar utils", () => {
  describe("getColor", () => {
    it("uses the default color without segments", () => {
      expect(getColor(5)).toBe(color("text-primary"));
      expect(getColor(5, [])).toBe(color("text-primary"));
    });

    it("uses the default color for a value no segment covers", () => {
      expect(
        getColor(500, [{ min: 0, max: 100, color: "red", label: "" }]),
      ).toBe(color("text-primary"));
    });

    it("uses the default color for a non-numeric value", () => {
      expect(getColor("abc", SEGMENTS)).toBe(color("text-primary"));
      expect(getColor(null, SEGMENTS)).toBe(color("text-primary"));
    });

    it("colors a value by the resolved segment containing it", () => {
      expect(getColor(50, SEGMENTS)).toBe("yellow");
      expect(getColor("50", SEGMENTS)).toBe("yellow");
    });

    it("treats a null bound as open-ended", () => {
      expect(getColor(-1000, SEGMENTS)).toBe("red");
      expect(getColor(1000, SEGMENTS)).toBe("green");
    });

    it("gives the first matching segment a shared bound", () => {
      expect(getColor(10, SEGMENTS)).toBe("red");
      expect(getColor(100, SEGMENTS)).toBe("yellow");
    });
  });

  describe("getTooltipContent", () => {
    it("has nothing to show without segments", () => {
      expect(getTooltipContent()).toBeNull();
      expect(getTooltipContent([])).toBeNull();
    });

    it("lists every segment's range and label", () => {
      render(<>{getTooltipContent(SEGMENTS)}</>);

      expect(screen.getByText("≤ 10")).toBeInTheDocument();
      expect(screen.getByText("low")).toBeInTheDocument();
      expect(screen.getByText("10 - 100")).toBeInTheDocument();
      expect(screen.getByText("mid")).toBeInTheDocument();
      expect(screen.getByText("≥ 100")).toBeInTheDocument();
      expect(screen.getByText("high")).toBeInTheDocument();
    });
  });

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

      // Unjustified type cast. FIXME
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

      // Unjustified type cast. FIXME
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

      // Unjustified type cast. FIXME
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

      // Unjustified type cast. FIXME
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

      // Unjustified type cast. FIXME
      const { displayValue, fullScalarValue } = compactifyValue(value, width, {
        ...formatOptions,
        compact: true,
      }) as { displayValue: string; fullScalarValue: string };

      expect(displayValue).toBe("10.0B");
      expect(fullScalarValue).toBe("10,010,010,010");
    });
  });
});
