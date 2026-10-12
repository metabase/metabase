import type { EventRef } from "../events/types";
import type {
  ActorPredicate,
  AnalysisKind,
  AnalysisSpec,
  TimeUnit,
} from "../spec/types";

import type { AnalysisContext, CommonSettings } from "./types";

export const isOneOf = <T extends string>(
  values: readonly T[],
  value: unknown,
): value is T => values.some((item) => item === value);

export const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

export const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

const TIME_UNITS: readonly TimeUnit[] = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
];

export const isPositiveDuration = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  "value" in value &&
  "unit" in value &&
  isPositiveInteger(value.value) &&
  isOneOf(TIME_UNITS, value.unit);

export const savedEvent = (id: string): EventRef => ({ type: "saved", id });

export const isValidEvent = (context: AnalysisContext, ref: unknown): boolean =>
  typeof ref === "object" &&
  ref !== null &&
  "type" in ref &&
  "id" in ref &&
  ref.type === "saved" &&
  context.savedEvents.some((event) => event.id === ref.id);

export const isUnknownArray = (value: unknown): value is unknown[] =>
  Array.isArray(value);

export const isValidEventList = (
  context: AnalysisContext,
  refs: unknown,
  minCount = 0,
): boolean =>
  isUnknownArray(refs) &&
  refs.length >= minCount &&
  refs.every((ref) => isValidEvent(context, ref));

export const getEventPickerProps = (context: AnalysisContext) => ({
  events: context.savedEvents,
});

const EMPTY_SCOPE: ActorPredicate = {
  kind: "group",
  joiner: "and",
  negated: false,
  items: [],
};

/** The parts of a spec every analysis shares. */
export const getCommonSpec = (
  kind: AnalysisKind,
  settings: CommonSettings,
): Pick<
  AnalysisSpec,
  "kind" | "timeRange" | "grain" | "measure" | "bucket" | "scope"
> => ({
  kind,
  // Unused by the planners: the date range lives in the base query.
  timeRange: { preset: "Last 90 days", tz: "UTC" },
  grain: settings.counting,
  measure: { agg: "uniq" },
  bucket: { granularity: settings.granularity },
  scope: EMPTY_SCOPE,
});
