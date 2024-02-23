import type { NumberFormatOptions } from "metabase/static-viz/lib/numbers";

import {
  GAUGE_ARC_ANGLE,
  SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE,
} from "./constants";
import {
  calculateRelativeValueAngle,
  calculateSegmentLabelTextAnchor,
  getCirclePositionInSvgCoordinate,
  limit,
  populateDefaultColumnSettings,
} from "./utils";

// calculateValueFontSize and calculateChartScale aren't tested since they
// rely on `measureText` which doesn't make much sense in unit tests.
// Cypress test with Percy snapshot should make sure they're fine.

describe("Static gauge utils", () => {
  describe("populateDefaultColumnSettings", () => {
    it("sets default currency and currency style", () => {
      const columnSettings = undefined;
      const expectedColumnSettingsWithDefaults = {
        currency: "USD",
        currency_style: "symbol",
      };

      expect(populateDefaultColumnSettings(columnSettings)).toEqual(
        expectedColumnSettingsWithDefaults,
      );
    });

    it("should not override currency", () => {
      const columnSettings: NumberFormatOptions = {
        scale: 1,
        currency: "EUR",
        currency_style: "code",
      };
      const expectedColumnSettingsWithDefaults = {
        scale: 1,
        currency: "EUR",
        currency_style: "code",
      };

      expect(populateDefaultColumnSettings(columnSettings)).toEqual(
        expectedColumnSettingsWithDefaults,
      );
    });
  });

  describe("limit", () => {
    const min = 0;
    const max = 10;

    it("sets value to min", () => {
      expect(limit(0, min, max)).toBe(0);
      expect(limit(-10, min, max)).toBe(0);
      expect(limit(-100, min, max)).toBe(0);
    });

    it("sets value to max", () => {
      expect(limit(10, min, max)).toBe(10);
      expect(limit(11, min, max)).toBe(10);
      expect(limit(100, min, max)).toBe(10);
    });

    it("sets value between min and max", () => {
      expect(limit(1, min, max)).toBe(1);
      expect(limit(5, min, max)).toBe(5);
      expect(limit(9, min, max)).toBe(9);
    });
  });

  describe("calculateRelativeValueAngle", () => {
    const minValue = 0;
    const maxValue = 10;
    it("calculates min value", () => {
      expect(calculateRelativeValueAngle(0, minValue, maxValue)).toEqual(0);
    });

    it("calculates max value", () => {
      expect(calculateRelativeValueAngle(10, minValue, maxValue)).toEqual(
        GAUGE_ARC_ANGLE,
      );
    });

    it("calculates value in the middle between min and max", () => {
      expect(calculateRelativeValueAngle(5, minValue, maxValue)).toEqual(
        GAUGE_ARC_ANGLE / 2,
      );
    });

    it("calculates value less than min", () => {
      expect(calculateRelativeValueAngle(-10, minValue, maxValue)).toEqual(
        -GAUGE_ARC_ANGLE,
      );
    });

    it("calculates value more than max", () => {
      expect(calculateRelativeValueAngle(20, minValue, maxValue)).toEqual(
        GAUGE_ARC_ANGLE * 2,
      );
    });
  });

  describe("getCirclePositionInSvgCoordinate", () => {
    // Since the value returned from `getCirclePositionInSvgCoordinate` was calculated
    // using Math.sin and Math.cos which doesn't totally return 0 in all cases.
    const almostZero = expect.closeTo(0, 5);

    it("return position 1 unit up from the origin", () => {
      const radius = 1;
      const angle = 0;
      expect(getCirclePositionInSvgCoordinate(radius, angle)).toEqual([0, -1]);
    });

    it("return position 1 unit right from the origin", () => {
      const radius = 1;
      const angle = Math.PI * (1 / 2);
      expect(getCirclePositionInSvgCoordinate(radius, angle)).toEqual([
        1,
        almostZero,
      ]);
    });

    it("return position 1 unit down from the origin", () => {
      const radius = 1;
      const angle = Math.PI * (2 / 2);
      expect(getCirclePositionInSvgCoordinate(radius, angle)).toEqual([
        almostZero,
        1,
      ]);
    });

    it("return position 1 unit left from the origin", () => {
      const radius = 1;
      const angle = Math.PI * (3 / 2);
      expect(getCirclePositionInSvgCoordinate(radius, angle)).toEqual([
        -1,
        almostZero,
      ]);
    });
  });

  describe("calculateSegmentLabelTextAnchor", () => {
    it('returns "end" for labels on the left half of the gauge', () => {
      expect(calculateSegmentLabelTextAnchor(-Math.PI / 2)).toEqual("end");
      expect(
        calculateSegmentLabelTextAnchor(
          -SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE - 0.001,
        ),
      ).toEqual("end");
    });

    it('returns "start" for labels on the right half of the gauge', () => {
      expect(
        calculateSegmentLabelTextAnchor(
          SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE + 0.001,
        ),
      ).toEqual("start");
      expect(calculateSegmentLabelTextAnchor(Math.PI / 2)).toEqual("start");
    });

    it('returns "middle" for labels on the middle portion of the gauge', () => {
      expect(
        calculateSegmentLabelTextAnchor(
          -SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE + 0.001,
        ),
      ).toEqual("middle");
      expect(
        calculateSegmentLabelTextAnchor(
          SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE - 0.001,
        ),
      ).toEqual("middle");
    });
  });
});
