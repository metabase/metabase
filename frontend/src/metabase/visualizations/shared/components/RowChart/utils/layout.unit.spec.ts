import type { TextWidthMeasurer } from "../../../types/measure-text";
import type { ChartFont } from "../../../types/style";

import { MAX_Y_TICK_WIDTH, getMaxWidth } from "./layout";

const ticksFont: ChartFont = {
  size: 12,
  family: "Lato",
  weight: 400,
  color: "#000",
};

const stubMeasureTextWidth: TextWidthMeasurer = (text, _style) =>
  text.length * 12;

describe("RowChart layout utils", () => {
  describe("getMaxWidth", () => {
    it("returns MAX_Y_TICK_WIDTH for short labels", () => {
      const labels = ["Short", "A", "Mid"];

      const width = getMaxWidth(labels, ticksFont, stubMeasureTextWidth);

      expect(width).toBe(MAX_Y_TICK_WIDTH);
    });

    it("returns measured width when labels exceed MAX_Y_TICK_WIDTH", () => {
      const labels = [
        "Finance Support North Sales East West Ops Central",
        "Short",
      ];

      const width = getMaxWidth(labels, ticksFont, stubMeasureTextWidth);

      // The long label is 49 chars * 12px = 588px
      expect(width).toBe(588);
      expect(width).toBeGreaterThan(MAX_Y_TICK_WIDTH);
    });

    it("returns MAX_Y_TICK_WIDTH for empty tick array", () => {
      const width = getMaxWidth([], ticksFont, stubMeasureTextWidth);

      expect(width).toBe(MAX_Y_TICK_WIDTH);
    });
  });
});
