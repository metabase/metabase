import { isObject } from "metabase-types/guards";

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

export const isGaugeRange = (value: unknown): value is GaugeRange => {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
};
