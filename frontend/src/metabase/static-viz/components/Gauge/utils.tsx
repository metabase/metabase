import type { PieArcDatum } from "@visx/shape/lib/shapes/Pie";
import { NumberFormatOptions } from "metabase/static-viz/lib/numbers";

import { measureText } from "metabase/static-viz/lib/text";
import {
  GAUGE_ARC_ANGLE,
  BASE_FONT_SIZE,
  VALUE_MARGIN,
  GAUGE_OUTER_RADIUS,
  SEGMENT_LABEL_MARGIN,
  DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
  SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE,
  SEGMENT_LABEL_FONT_SIZE,
  START_ANGLE,
} from "./constants";

import type {
  GaugeLabelData,
  GaugeSegment,
  Position,
  TextAnchor,
} from "./types";

export function populateDefaultColumnSettings(
  columnSettings: NumberFormatOptions,
): NumberFormatOptions {
  return { currency: "USD", currency_style: "symbol", ...columnSettings };
}

export function limit(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function calculateRelativeValueAngle(
  value: number,
  minValue: number,
  maxValue: number,
) {
  return ((value - minValue) / (maxValue - minValue)) * GAUGE_ARC_ANGLE;
}

export function getCirclePositionInSvgCoordinate(
  radius: number,
  angleRadian: number,
): Position {
  return [Math.sin(angleRadian) * radius, -Math.cos(angleRadian) * radius];
}

export function calculateValueFontSize(displayValue: string, maxWidth: number) {
  let dynamicValueFontSize = BASE_FONT_SIZE;
  while (
    measureText(displayValue, dynamicValueFontSize) >
    2 * (maxWidth - VALUE_MARGIN)
  ) {
    dynamicValueFontSize -= 1;
  }
  return dynamicValueFontSize;
}

export function calculateSegmentLabelPosition(angle: number): Position {
  return getCirclePositionInSvgCoordinate(
    GAUGE_OUTER_RADIUS + SEGMENT_LABEL_MARGIN + DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
    angle,
  );
}

export function calculateSegmentLabelTextAnchor(angle: number): TextAnchor {
  if (
    isBetweenAngle(angle, START_ANGLE, -SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE)
  ) {
    return "end";
  }

  if (
    isBetweenAngle(
      angle,
      -SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE,
      SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE,
    )
  ) {
    return "middle";
  }

  return "start";
}

export function calculateChartScale(gaugeLabels: GaugeLabelData[]) {
  const gaugeLabelDimensions = gaugeLabels.map(gaugeLabel => {
    const labelWidth = measureText(gaugeLabel.value, SEGMENT_LABEL_FONT_SIZE);

    return {
      left:
        gaugeLabel.position[0] -
        calculateLeftXOffset(gaugeLabel.textAnchor, labelWidth),
      right:
        gaugeLabel.position[0] +
        (labelWidth - calculateLeftXOffset(gaugeLabel.textAnchor, labelWidth)),
    };
  });

  const maxLabelDistanceFromCenter = gaugeLabelDimensions.reduce(
    (currentMaxLabelDistanceFromCenter, gaugeLabelDimension) => {
      return Math.max(
        Math.abs(gaugeLabelDimension.left),
        Math.abs(gaugeLabelDimension.right),
        currentMaxLabelDistanceFromCenter,
      );
    },
    0,
  );

  return Math.min(1, GAUGE_OUTER_RADIUS / maxLabelDistanceFromCenter);
}

function calculateLeftXOffset(textAnchor: TextAnchor, labelWidth: number) {
  switch (textAnchor) {
    case "start":
      return 0;
    case "end":
      return labelWidth;
    case "middle":
      return labelWidth / 2;
    default:
      return 0;
  }
}

export function gaugeAccessor(segment: GaugeSegment) {
  return segment.max - segment.min;
}

export function gaugeSorter(
  thisSegment: GaugeSegment,
  thatSegment: GaugeSegment,
) {
  return thisSegment.min - thatSegment.min;
}

export function colorGetter(pieArcDatum: PieArcDatum<GaugeSegment>) {
  return pieArcDatum.data.color;
}

/**
 * A reducer to remove duplicate elements from a list
 */
export function removeDuplicateElements(
  uniqueList: number[],
  element: number,
): number[] {
  if (uniqueList.includes(element)) {
    return uniqueList;
  }

  return uniqueList.concat(element);
}

const CIRCLE_ANGLE = 2 * Math.PI;
function isBetweenAngle(
  angle: number,
  fromAngle: number,
  toAngle: number,
): boolean {
  const normalizedAngle = normalizeAngle(angle);
  const normalizedFromAngle = normalizeAngle(fromAngle);
  const normalizedToAngle = normalizeAngle(toAngle);
  if (normalizedFromAngle > normalizedToAngle) {
    return (
      normalizedAngle >= normalizedFromAngle ||
      normalizedAngle <= normalizedToAngle
    );
  }

  return (
    normalizedAngle >= normalizedFromAngle &&
    normalizedAngle <= normalizedToAngle
  );
}

/**
 * @returns angle in positive radian
 */
function normalizeAngle(angle: number) {
  return (angle + CIRCLE_ANGLE) % CIRCLE_ANGLE;
}
