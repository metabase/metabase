import { render, screen } from "__support__/ui";
import { color } from "metabase/ui/utils/colors";
import type { ResolvedOpenEndedGoalSegment } from "metabase/viz-core";
import { TYPE } from "metabase-lib/v1/types/constants";

import {
  compactifyValue,
  estimateScalarValueWidth,
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
