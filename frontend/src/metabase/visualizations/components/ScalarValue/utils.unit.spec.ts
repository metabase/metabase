import {
  computeFontSize,
  computeFontSizeAdjustment,
  WIDTH_ADJUSTMENT_FACTOR,
  HEIGHT_ADJUSTMENT_FACTOR,
  MAX_HEIGHT_GRID_SIZE,
  MIN_SIZE_REM,
  MAX_SIZE_REM,
} from "./utils";

describe("ScalarValue utils", () => {
  const baseProps = {
    isDashboard: true,
    gridSize: { height: 5, width: 5 },
    minGridSize: { height: 3, width: 3 },
    width: 100,
    height: 100,
    totalNumGridCols: 15,
  };

  describe("computeFontSize", () => {
    it("should return a rem font size value", () => {
      const fontSize = computeFontSize({
        ...baseProps,
        gridSize: { height: 10, width: 10 },
        minGridSize: { height: 2, width: 2 },
        totalNumGridCols: 10,
      });
      expect(fontSize).toEqual(
        `${MIN_SIZE_REM +
          HEIGHT_ADJUSTMENT_FACTOR +
          WIDTH_ADJUSTMENT_FACTOR}rem`,
      );
    });

    it("1. should handle incorrect inputs", () => {
      const fontSize = computeFontSize({
        ...baseProps,
        // results in font size < MIN_SIZE_REM
        gridSize: { height: -10, width: -10 },
        minGridSize: { height: 2, width: 2 },
        totalNumGridCols: 10,
      });
      expect(fontSize).toEqual(`${MIN_SIZE_REM}rem`);
    });

    it("2. should handle incorrect inputs", () => {
      const fontSize = computeFontSize({
        ...baseProps,
        gridSize: { height: 999, width: 999 },
        minGridSize: { height: -1, width: -1 },
        // causes a NaN
        totalNumGridCols: -1,
      });
      expect(fontSize).toEqual(`${MIN_SIZE_REM}rem`);
    });

    it("3. should handle incorrect inputs", () => {
      const fontSize = computeFontSize({
        ...baseProps,
        // results in font size > MAX_SIZE_REM
        width: -100,
        height: -100,
        gridSize: { height: 123, width: 123 },
        minGridSize: { height: 1, width: 1 },
        totalNumGridCols: 123,
      });
      expect(fontSize).toEqual(`${MAX_SIZE_REM}rem`);
    });
  });

  describe("computeFontSizeAdjustment", () => {
    it("should return 0 if any of the props are missing", () => {
      const keys = Object.keys(baseProps);
      for (const key of keys) {
        const props = { ...baseProps, [key]: undefined };
        expect(computeFontSizeAdjustment(props)).toEqual(0);
      }
    });

    it("should return 0 if any of the number props are 0", () => {
      const numberKeys = Object.keys(baseProps).filter(key => {
        const value = baseProps[key as keyof typeof baseProps];
        return typeof value === "number";
      });

      for (const key of numberKeys) {
        const props = { ...baseProps, [key]: 0 };
        expect(computeFontSizeAdjustment(props)).toEqual(0);
      }
    });

    it("should return 0 for wonky gridSize values", () => {
      const props = {
        ...baseProps,
        gridSize: { height: 0, width: 0 },
        totalNumGridCols: 1,
      };

      expect(computeFontSizeAdjustment(props)).toEqual(0);
    });

    it("should return 0 for wonky minGridSize values", () => {
      const props = {
        ...baseProps,
        minGridSize: { height: 0, width: 0 },
      };

      expect(computeFontSizeAdjustment(props)).toEqual(0);
    });

    it("should return 0 when the gridSize match the minimum values", () => {
      const props = {
        ...baseProps,
        gridSize: { height: 3, width: 3 },
        minGridSize: { height: 3, width: 3 },
      };

      expect(computeFontSizeAdjustment(props)).toEqual(0);
    });

    it("should NOT consider height in the final output if the width is at the min", () => {
      const props = {
        ...baseProps,
        gridSize: { height: MAX_HEIGHT_GRID_SIZE, width: 3 },
        minGridSize: { height: 3, width: 3 },
      };

      expect(computeFontSizeAdjustment(props)).toEqual(0);
    });

    it("should only consider width in the final output if the height is at the min", () => {
      const props = {
        ...baseProps,
        gridSize: { height: 3, width: 10 },
        minGridSize: { height: 3, width: 3 },
        totalNumGridCols: 10,
      };

      expect(computeFontSizeAdjustment(props)).toEqual(WIDTH_ADJUSTMENT_FACTOR);
    });

    it("should return WIDTH_ADJUSTMENT_FACTOR + HEIGHT_ADJUSTMENT_FACTOR when the gridSize matches the max values", () => {
      const props = {
        ...baseProps,
        gridSize: { height: MAX_HEIGHT_GRID_SIZE, width: 15 },
        totalNumGridCols: 15,
      };

      expect(computeFontSizeAdjustment(props)).toEqual(
        WIDTH_ADJUSTMENT_FACTOR + HEIGHT_ADJUSTMENT_FACTOR,
      );
    });

    it("should treat a totalNumGridCols < gridSize.width scenario as the dashcard spanning the entire grid", () => {
      const props = {
        ...baseProps,
        gridSize: { height: 3, width: 10 },
        totalNumGridCols: 1,
      };

      expect(computeFontSizeAdjustment(props)).toEqual(WIDTH_ADJUSTMENT_FACTOR);
    });

    it("should output reasonable values between the mins and the maxes", () => {
      expect(
        Math.round(
          computeFontSizeAdjustment({
            ...baseProps,
            gridSize: { height: 3, width: 4 },
            minGridSize: { height: 2, width: 2 },
            totalNumGridCols: 10,
          }),
        ),
      ).toEqual(2);

      expect(
        Math.round(
          computeFontSizeAdjustment({
            ...baseProps,
            gridSize: { height: 7, width: 7 },
            minGridSize: { height: 2, width: 2 },
            totalNumGridCols: 10,
          }),
        ),
      ).toEqual(5);

      expect(
        Math.round(
          computeFontSizeAdjustment({
            ...baseProps,
            gridSize: { height: 9, width: 9 },
            minGridSize: { height: 2, width: 2 },
            totalNumGridCols: 10,
          }),
        ),
      ).toEqual(7);
    });

    it("should avoid a large height adjustment for a low gridSize.width", () => {
      expect(
        Math.round(
          computeFontSizeAdjustment({
            ...baseProps,
            gridSize: { height: 9, width: 5 },
            minGridSize: { height: 2, width: 2 },
            totalNumGridCols: 10,
          }),
        ),
      ).toEqual(3);
    });
  });
});
