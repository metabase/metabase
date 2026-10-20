import type { EventFlags } from "../events/types";
import type {
  ActorPredicate,
  AnalysisKind,
  AnalysisSpec,
  TimeUnit,
} from "../spec/types";

import type {
  AnalysisContext,
  CommonSettings,
  MissingSetting,
  SpecResult,
} from "./types";

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

/**
 * Checks shape only, without metadata. A query that passes can still fail to
 * read; see `readEventQuery`.
 */
export const isEventDefinition = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  "query" in value &&
  typeof value.name === "string" &&
  value.name.trim() !== "" &&
  typeof value.query === "object" &&
  value.query !== null &&
  "stages" in value.query &&
  isUnknownArray(value.query.stages) &&
  value.query.stages.length > 0;

/** For a single-event setting, where `null` means no event is defined yet. */
export const isOptionalEventDefinition = (value: unknown): boolean =>
  value === null || isEventDefinition(value);

export const isUnknownArray = (value: unknown): value is unknown[] =>
  Array.isArray(value);

/**
 * A list that's too short is still kept, so the user can build it up one
 * event at a time; `toSpec` reports it as incomplete.
 */
export const isEventDefinitionList = (value: unknown): boolean =>
  isUnknownArray(value) && value.every(isEventDefinition);

export const ready = (spec: AnalysisSpec): SpecResult => ({
  status: "ready",
  spec,
});

export const incomplete = (missing: MissingSetting[]): SpecResult => ({
  status: "incomplete",
  missing,
});

/** `missing` when `isMissing`, for spreading into an `incomplete` list. */
export const missingIf = (
  isMissing: boolean,
  missing: MissingSetting,
): MissingSetting[] => (isMissing ? [missing] : []);

export const getEventDefinitionProps = (context: AnalysisContext) => ({
  table: context.table,
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

/**
 * The pageview event, when there's a URL path column to name pageviews by.
 * Without one, pageviews are named like any other event.
 */
export const getPageviewSpec = (
  settings: CommonSettings,
  events: EventFlags,
): Pick<AnalysisSpec, "pageview"> =>
  settings.pageviews !== null && settings["columns.url_path"] !== null
    ? { pageview: { flag: events.flagFor(settings.pageviews) } }
    : {};
