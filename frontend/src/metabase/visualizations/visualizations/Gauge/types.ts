import { isObject } from "metabase-types/guards";
import { segmentIsValid } from "metabase/viz-core";

export type GaugeSegment = {
  color?: string;
  label?: string;
  min: number;
  max: number;
};

export type GaugeRange = [number, number];

export const isGaugeSegment = (value: unknown): value is GaugeSegment => {
  return (
    isObject(value) &&
    typeof value.min === "number" &&
    typeof value.max === "number"
  );
};

export const isGaugeSegmentsArray = (
  value: unknown,
): value is GaugeSegment[] => {
  return Array.isArray(value) && value.every(isGaugeSegment);
};

// Returns only the complete ranges, so one range with an empty Min or Max
// no longer discards every other range (metabase#83439). Incomplete rows are
// still excluded because a Gauge range needs both bounds to draw.
export const getValidGaugeSegments = (value: unknown): GaugeSegment[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isGaugeSegment)
    .filter((segment) => segmentIsValid(segment));
};

export const isGaugeRange = (value: unknown): value is GaugeRange => {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
};
