import { match } from "ts-pattern";

import * as Lib from "metabase-lib";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isa } from "metabase-lib/v1/types/utils/isa";
import type { DateTimeAbsoluteUnit, DatetimeUnit } from "metabase-types/api";
import { dateTimeAbsoluteUnits } from "metabase-types/api/query";

import {
  ATTRIBUTE_SEMANTICS,
  CAPS,
  DAYS_PER_UNIT,
  HIDDEN_VISIBILITY,
  KEY_NAME_RE,
  MEASURE_NAME_RE,
  MEASURE_SEMANTICS,
  THRESH,
} from "./constants";
import type {
  Cardinality,
  ColumnProfile,
  ColumnRole,
  ColumnType,
  GeoInfo,
  NormalizedFingerprint,
  NumericStats,
  ProfileContext,
  ProfileInput,
  RowStats,
} from "./types";

export type RoleAssignment = {
  role: ColumnRole;
  confidence: number;
  altRole?: ColumnRole;
};

const MS_PER_DAY = 86_400_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(
  record: Record<string, unknown> | null,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function readString(
  record: Record<string, unknown> | null,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function subRecord(
  record: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  const value = record?.[key];
  return isRecord(value) ? value : null;
}

// Accepts both the API's kebab-case FieldFingerprint and the camelCase
// FingerprintDisplayInfo returned by Lib.displayInfo.
export function normalizeFingerprint(
  raw: unknown,
): NormalizedFingerprint | null {
  if (!isRecord(raw)) {
    return null;
  }
  const global = subRecord(raw, "global");
  const type = subRecord(raw, "type");
  const number = subRecord(type, "type/Number");
  const text = subRecord(type, "type/Text");
  const temporal = subRecord(type, "type/DateTime");

  const numberStats: NormalizedFingerprint["number"] | undefined = number
    ? {
        min: readNumber(number, "min"),
        max: readNumber(number, "max"),
        q1: readNumber(number, "q1"),
        q3: readNumber(number, "q3"),
        avg: readNumber(number, "avg"),
        sd: readNumber(number, "sd"),
        skew: readNumber(number, "skewness", "skew"),
        zeroFrac: readNumber(number, "zero-fraction", "zeroFraction"),
        modeFraction: readNumber(number, "mode-fraction", "modeFraction"),
        top3Fraction: readNumber(number, "top-3-fraction", "top3Fraction"),
      }
    : undefined;
  const textStats: NormalizedFingerprint["text"] | undefined = text
    ? {
        averageLength: readNumber(text, "average-length", "averageLength"),
        percentJson: readNumber(text, "percent-json", "percentJson"),
        percentUrl: readNumber(text, "percent-url", "percentUrl"),
        percentEmail: readNumber(text, "percent-email", "percentEmail"),
        percentState: readNumber(text, "percent-state", "percentState"),
        percentBlank: readNumber(text, "percent-blank", "percentBlank"),
        modeFraction: readNumber(text, "mode-fraction", "modeFraction"),
        top3Fraction: readNumber(text, "top-3-fraction", "top3Fraction"),
      }
    : undefined;
  const temporalStats: NormalizedFingerprint["temporal"] | undefined = temporal
    ? {
        earliest: readString(temporal, "earliest"),
        latest: readString(temporal, "latest"),
        modeFraction: readNumber(temporal, "mode-fraction", "modeFraction"),
        top3Fraction: readNumber(temporal, "top-3-fraction", "top3Fraction"),
      }
    : undefined;

  return {
    distinctCount: readNumber(global, "distinct-count", "distinctCount"),
    nilFraction: readNumber(global, "nil%", "nilFraction"),
    number: numberStats,
    text: textStats,
    temporal: temporalStats,
  };
}

export function columnType(type: string | null | undefined): ColumnType {
  if (type == null) {
    return "other";
  }
  if (isa(type, TYPE.Temporal)) {
    return "temporal";
  }
  if (isa(type, TYPE.Boolean)) {
    return "boolean";
  }
  if (isa(type, TYPE.Number)) {
    return "number";
  }
  if (isa(type, TYPE.Text)) {
    return "text";
  }
  if (isa(type, TYPE.TextLike)) {
    return "textlike";
  }
  if (
    isa(type, TYPE.Structured) ||
    isa(type, TYPE.Collection) ||
    isa(type, TYPE.Large)
  ) {
    return "structured";
  }
  return "other";
}

export function typeInfoOf(input: ProfileInput): Lib.ColumnTypeInfo {
  return Lib.legacyColumnTypeInfo({
    base_type: input.baseType ?? undefined,
    effective_type: input.effectiveType,
    semantic_type: input.semantic,
  });
}

// A truncated date can surface with an integer effective type (e.g. year);
// the bucket is the stronger signal.
function inputColumnType(input: ProfileInput): ColumnType {
  if (input.unitKind === "truncation") {
    return "temporal";
  }
  return columnType(input.effectiveType ?? input.baseType);
}

function isTextlikeId(input: ProfileInput): boolean {
  const type = input.effectiveType ?? input.baseType;
  return isa(type, TYPE.UUID) || isa(type, TYPE.MongoBSONID);
}

function isNearUniqueNumber(input: ProfileInput): boolean {
  const fingerprint = input.fingerprint;
  if (
    fingerprint?.distinctCount == null ||
    inputColumnType(input) !== "number"
  ) {
    return false;
  }
  const top3 = fingerprint.number?.top3Fraction;
  return (
    fingerprint.distinctCount >= CAPS.FINGERPRINT_SAMPLE * 0.95 &&
    top3 != null &&
    top3 < THRESH.NEAR_UNIQUE_TOP3
  );
}

export function isKeyColumn(input: ProfileInput): boolean {
  if (input.source === "aggregation") {
    return false;
  }
  const typeInfo = typeInfoOf(input);
  return (
    Lib.isPrimaryKey(typeInfo) ||
    Lib.isForeignKey(typeInfo) ||
    input.databaseIsPk ||
    input.databaseIsAutoIncrement ||
    KEY_NAME_RE.test(input.name) ||
    isTextlikeId(input) ||
    isNearUniqueNumber(input)
  );
}

function hasAttributeSemantic(semantic: string | null): boolean {
  return ATTRIBUTE_SEMANTICS.some((attribute) => isa(semantic, attribute));
}

function isHiddenVisibility(input: ProfileInput): boolean {
  return HIDDEN_VISIBILITY.some((hidden) => hidden === input.visibilityType);
}

function isTextAttribute(input: ProfileInput): boolean {
  if (inputColumnType(input) !== "text") {
    return false;
  }
  const text = input.fingerprint?.text;
  if (text == null) {
    return false;
  }
  const mostlyUnstructured = [
    text.percentJson,
    text.percentUrl,
    text.percentEmail,
  ].some((percent) => percent != null && percent > THRESH.ATTRIBUTE_PERCENT);
  const tooLong =
    text.averageLength != null &&
    text.averageLength > THRESH.ATTRIBUTE_AVG_LENGTH;
  const nearUnique =
    text.top3Fraction != null && text.top3Fraction < THRESH.NEAR_UNIQUE_TOP3;
  return mostlyUnstructured || tooLong || nearUnique;
}

export function isAttributeColumn(input: ProfileInput): boolean {
  return (
    hasAttributeSemantic(input.semantic) ||
    inputColumnType(input) === "structured" ||
    isHiddenVisibility(input) ||
    input.previewDisplay === false ||
    isTextAttribute(input)
  );
}

function daySpan(earliest: string, latest: string): number | null {
  const start = Date.parse(earliest);
  const end = Date.parse(latest);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null;
  }
  return Math.max(0, (end - start) / MS_PER_DAY);
}

function isAbsoluteUnit(
  unit: DatetimeUnit | null,
): unit is DateTimeAbsoluteUnit {
  return dateTimeAbsoluteUnits.some((absolute) => absolute === unit);
}

function defaultUnitForType(input: ProfileInput): DateTimeAbsoluteUnit {
  const type = input.effectiveType ?? input.baseType;
  if (isa(type, TYPE.Time)) {
    return "hour";
  }
  if (isa(type, TYPE.Date)) {
    return "day";
  }
  return "month";
}

// Coarsest unit that still yields at least TIME_BUCKET_TARGET_MIN buckets,
// falling back to the type default when the span is unknown.
export function inferTimeUnit(input: ProfileInput): DateTimeAbsoluteUnit {
  if (input.unitKind === "truncation" && isAbsoluteUnit(input.unit)) {
    return input.unit;
  }
  const span = input.fingerprint?.temporal;
  const days =
    span?.earliest != null && span.latest != null
      ? daySpan(span.earliest, span.latest)
      : null;
  if (days == null || days === 0) {
    return defaultUnitForType(input);
  }
  const coarseToFine = [...dateTimeAbsoluteUnits].reverse();
  const fitting = coarseToFine.find(
    (unit) => days / DAYS_PER_UNIT[unit] >= CAPS.TIME_BUCKET_TARGET_MIN,
  );
  return fitting ?? "minute";
}

function timeSpanCardinality(input: ProfileInput): Cardinality {
  const span = input.fingerprint?.temporal;
  const days =
    span?.earliest != null && span.latest != null
      ? daySpan(span.earliest, span.latest)
      : null;
  if (days == null) {
    return { estimate: null, exact: false, source: "unknown" };
  }
  const unit = inferTimeUnit(input);
  return {
    estimate: Math.max(1, Math.ceil(days / DAYS_PER_UNIT[unit])),
    exact: false,
    source: "time-span",
  };
}

function binningCardinality(input: ProfileInput): Cardinality {
  const binning = input.binning;
  const fromWidth =
    binning?.binWidth != null &&
    binning.binWidth > 0 &&
    binning.min != null &&
    binning.max != null
      ? Math.ceil((binning.max - binning.min) / binning.binWidth)
      : null;
  const estimate = binning?.numBins ?? fromWidth ?? CAPS.DEFAULT_BINS;
  return { estimate: Math.max(1, estimate), exact: false, source: "binning" };
}

function fingerprintCardinality(
  input: ProfileInput,
  source: Cardinality["source"],
): Cardinality {
  const distinct = input.fingerprint?.distinctCount;
  if (distinct == null) {
    return { estimate: null, exact: false, source: "unknown" };
  }
  return { estimate: distinct, exact: false, source };
}

export function estimateCardinality(
  input: ProfileInput,
  role: ColumnRole,
): Cardinality {
  if (role === "DIM_TIME") {
    return timeSpanCardinality(input);
  }
  if (role === "DIM_BINNED") {
    return binningCardinality(input);
  }
  if (inputColumnType(input) === "boolean") {
    return { estimate: 2, exact: false, source: "schema" };
  }
  if (input.remappedTo != null || input.remappedFrom != null) {
    return fingerprintCardinality(input, "remap");
  }
  return fingerprintCardinality(input, "fingerprint");
}

function isSmallDistinct(input: ProfileInput, max: number): boolean {
  const distinct = input.fingerprint?.distinctCount;
  return distinct != null && distinct <= max;
}

function isListValued(input: ProfileInput): boolean {
  return input.hasFieldValues === "list";
}

function assignBreakoutRole(input: ProfileInput): RoleAssignment {
  const typeInfo = typeInfoOf(input);
  const type = inputColumnType(input);

  if (Lib.isLatitude(typeInfo) || Lib.isLongitude(typeInfo)) {
    return { role: "DIM_GEO_LATLON", confidence: 1 };
  }
  if (input.unitKind === "extraction") {
    return { role: "DIM_CYCLIC", confidence: 1 };
  }
  if (type === "temporal") {
    return { role: "DIM_TIME", confidence: 1 };
  }
  if (input.binning != null) {
    return { role: "DIM_BINNED", confidence: 1 };
  }
  if (Lib.isState(typeInfo) || Lib.isCountry(typeInfo)) {
    return { role: "DIM_GEO_REGION", confidence: 1 };
  }
  if (type === "boolean") {
    return { role: "DIM_CATEGORY", confidence: 1 };
  }
  if (type === "number") {
    const ordinal =
      isKeyColumn(input) ||
      Lib.isCategory(typeInfo) ||
      isListValued(input) ||
      isSmallDistinct(input, CAPS.ORDINAL_NUM_MAX_CARD);
    return ordinal
      ? { role: "DIM_ORDINAL_NUM", confidence: 1 }
      : { role: "DIM_NUMERIC", confidence: 1 };
  }
  return { role: "DIM_CATEGORY", confidence: 1 };
}

function assignAggregationRole(input: ProfileInput): RoleAssignment {
  const type = input.agg?.argType ?? inputColumnType(input);
  if (type === "temporal" || type === "text" || type === "textlike") {
    return { role: "ATTRIBUTE", confidence: 1 };
  }
  return { role: "MEASURE", confidence: 1 };
}

function hasMeasureSemantic(semantic: string | null): boolean {
  return MEASURE_SEMANTICS.some((measure) => isa(semantic, measure));
}

function assignUninformativeNumber(input: ProfileInput): RoleAssignment {
  const typeInfo = typeInfoOf(input);
  if (Lib.isLatitude(typeInfo) || Lib.isLongitude(typeInfo)) {
    return { role: "DIM_GEO_LATLON", confidence: 0.9 };
  }
  if (Lib.isZipCode(typeInfo)) {
    return { role: "DIM_CATEGORY", confidence: 0.8 };
  }
  if (hasMeasureSemantic(input.semantic)) {
    return { role: "MEASURE", confidence: 0.9 };
  }
  if (MEASURE_NAME_RE.test(input.name)) {
    return { role: "MEASURE", confidence: 0.8 };
  }
  if (
    Lib.isInteger(typeInfo) &&
    isSmallDistinct(input, CAPS.ORDINAL_NUM_MAX_CARD)
  ) {
    return { role: "DIM_ORDINAL_NUM", confidence: 0.6, altRole: "MEASURE" };
  }
  if (!Lib.isInteger(typeInfo)) {
    return { role: "MEASURE", confidence: 0.7 };
  }
  return { role: "MEASURE", confidence: 0.5, altRole: "DIM_NUMERIC" };
}

function assignUninformativeText(input: ProfileInput): RoleAssignment {
  const smallEnough =
    isSmallDistinct(input, CAPS.UNINFORMATIVE_CATEGORY_MAX_CARD) ||
    isListValued(input);
  return smallEnough
    ? { role: "DIM_CATEGORY", confidence: 0.8 }
    : { role: "ATTRIBUTE", confidence: 0.7 };
}

export function assignRoleUninformative(input: ProfileInput): RoleAssignment {
  if (isKeyColumn(input)) {
    return { role: "KEY", confidence: 1 };
  }
  if (isAttributeColumn(input)) {
    return { role: "ATTRIBUTE", confidence: 1 };
  }
  return match(inputColumnType(input))
    .returnType<RoleAssignment>()
    .with("temporal", () => ({ role: "DIM_TIME", confidence: 0.8 }))
    .with("boolean", () => ({ role: "DIM_CATEGORY", confidence: 0.9 }))
    .with("text", "textlike", () => assignUninformativeText(input))
    .with("number", () => assignUninformativeNumber(input))
    .with("structured", "other", () => ({ role: "ATTRIBUTE", confidence: 0.8 }))
    .exhaustive();
}

export function assignRole(
  input: ProfileInput,
  ctx: ProfileContext,
): RoleAssignment {
  const informative = ctx.isNative ? (ctx.native?.aggregated ?? false) : true;
  return match(input.source)
    .returnType<RoleAssignment>()
    .with("aggregation", () => assignAggregationRole(input))
    .with("breakout", () =>
      isAttributeColumn(input) && !ctx.isNative
        ? { role: "ATTRIBUTE", confidence: 1 }
        : assignBreakoutRole(input),
    )
    .with("fields", "expression", "unknown", () =>
      assignRoleUninformative(input),
    )
    .with("native", () =>
      informative && isAttributeColumn(input)
        ? { role: "ATTRIBUTE", confidence: 1 }
        : assignRoleUninformative(input),
    )
    .exhaustive();
}

function numericStats(input: ProfileInput): NumericStats | null {
  const number = input.fingerprint?.number;
  if (number == null) {
    return null;
  }
  const { min, max, q1, q3, avg, sd, skew, zeroFrac } = number;
  return {
    min,
    max,
    q1,
    q3,
    avg,
    sd,
    skew,
    zeroFrac,
    allNonNeg: min != null ? min >= 0 : undefined,
    includesZero: min != null && max != null ? min <= 0 && max >= 0 : undefined,
  };
}

function geoInfo(input: ProfileInput, role: ColumnRole): GeoInfo | null {
  const typeInfo = typeInfoOf(input);
  if (role === "DIM_GEO_REGION") {
    return Lib.isState(typeInfo)
      ? { kind: "state", region: "us_states" }
      : { kind: "country", region: "world_countries" };
  }
  if (role === "DIM_GEO_LATLON") {
    return { kind: Lib.isLatitude(typeInfo) ? "lat" : "lon" };
  }
  return null;
}

function labelLength(input: ProfileInput): number | null {
  return input.fingerprint?.text?.averageLength ?? null;
}

function topShare(input: ProfileInput): number | null {
  const fingerprint = input.fingerprint;
  return (
    fingerprint?.number?.modeFraction ??
    fingerprint?.text?.modeFraction ??
    fingerprint?.temporal?.modeFraction ??
    null
  );
}

function temporalSpan(input: ProfileInput): ColumnProfile["temporalSpan"] {
  const temporal = input.fingerprint?.temporal;
  return temporal?.earliest != null && temporal.latest != null
    ? { earliest: temporal.earliest, latest: temporal.latest }
    : null;
}

const NON_PLOTTABLE_ROLES: readonly ColumnRole[] = [
  "ATTRIBUTE",
  "KEY",
  "UNKNOWN",
];

function resolvedUnit(
  input: ProfileInput,
  role: ColumnRole,
): ColumnProfile["unit"] {
  if (role !== "DIM_TIME") {
    return input.unit;
  }
  return input.unit == null || input.unit === "default"
    ? inferTimeUnit(input)
    : input.unit;
}

export function profileColumn(
  input: ProfileInput,
  ctx: ProfileContext,
): ColumnProfile {
  const assignment = assignRole(input, ctx);
  const role = assignment.role;
  const unit = resolvedUnit(input, role);
  return {
    name: input.name,
    displayName: input.displayName,
    index: input.index,
    type: inputColumnType(input),
    role,
    roleConfidence: assignment.confidence,
    altRole: assignment.altRole,
    source: input.source,
    agg: input.agg,
    unit,
    unitKind: unit == null ? null : (input.unitKind ?? "truncation"),
    binning: input.binning,
    cardinality: estimateCardinality(input, role),
    labelLength: labelLength(input),
    nilFraction: input.fingerprint?.nilFraction ?? null,
    numeric: numericStats(input),
    semantic: input.semantic,
    effectiveType: input.effectiveType ?? input.baseType,
    geo: geoInfo(input, role),
    remap:
      input.remappedFrom != null ||
      input.remappedTo != null ||
      input.fkTargetFieldId != null
        ? {
            from: input.remappedFrom ?? undefined,
            to: input.remappedTo ?? undefined,
            fkTargetFieldId: input.fkTargetFieldId,
          }
        : null,
    isKey: isKeyColumn(input),
    isAttribute: isAttributeColumn(input),
    plottable: !NON_PLOTTABLE_ROLES.includes(role),
    interestingness: input.interestingness,
    topShare: topShare(input),
    temporalSpan: temporalSpan(input),
  };
}

// Cardinality from scanned rows always beats a fingerprint estimate.
function withExactCardinality(
  profile: ColumnProfile,
  rowStats: RowStats,
): ColumnProfile {
  const distinct = rowStats.distinct[profile.index];
  if (distinct == null) {
    return profile;
  }
  return {
    ...profile,
    cardinality: {
      estimate: distinct.count,
      exact: distinct.exact,
      source: "rows",
    },
  };
}

export function profileColumns(
  inputs: ProfileInput[],
  ctx: ProfileContext,
  rowStats?: RowStats,
): ColumnProfile[] {
  const profiles = inputs.map((input) => profileColumn(input, ctx));
  return rowStats
    ? profiles.map((profile) => withExactCardinality(profile, rowStats))
    : profiles;
}

export type GroupedKeyPromotion = {
  profiles: ColumnProfile[];
  aggregated: boolean;
};

// Distinct raw timestamps alone do not make a grouped key (an event log has
// them too); a time-only key must also be regularly bucketed.
function isBucketedTimeKey(keys: ColumnProfile[], rowStats: RowStats): boolean {
  const timeOnly = keys.every((key) => key.role === "DIM_TIME");
  return (
    !timeOnly ||
    keys.every((key) => rowStats.timeSeries[key.index]?.regular === true)
  );
}

// A raw result whose non-measure columns form a unique key per row behaves
// like an aggregated one (e.g. a hand-written GROUP BY without parser hints).
export function promoteAggregatedIfGroupedKey(
  profiles: ColumnProfile[],
  rowStats: RowStats | null,
  aggregatedPrior: boolean,
): GroupedKeyPromotion {
  const measures = profiles.filter((profile) => profile.role === "MEASURE");
  const keys = profiles.filter((profile) => profile.role !== "MEASURE");
  const groupedKey =
    rowStats?.groupedKeyUnique === true &&
    measures.length >= 1 &&
    keys.length >= 1 &&
    isBucketedTimeKey(keys, rowStats);
  if (aggregatedPrior || !groupedKey) {
    return { profiles, aggregated: aggregatedPrior };
  }
  return {
    aggregated: true,
    profiles: profiles.map((profile) =>
      profile.role === "MEASURE"
        ? { ...profile, roleConfidence: Math.max(profile.roleConfidence, 0.9) }
        : profile,
    ),
  };
}
