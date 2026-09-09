import { TYPE } from "metabase-lib/v1/types/constants";
import { isa } from "metabase-lib/v1/types/utils/isa";
import type { DateTimeAbsoluteUnit } from "metabase-types/api";
import { dateTimeAbsoluteUnits } from "metabase-types/api/query";

import {
  CAPS,
  DAYS_PER_UNIT,
  SCALE_FAMILY_PER_ROW_OPS,
  THRESH,
} from "./constants";
import type { ColumnProfile, ColumnRole, Shape } from "./types";

export type ShapeContext = {
  isNative: boolean;
  aggregated: boolean;
  rowCount: number | null;
  rowCountExact: boolean;
};

export function cardinalityOf(profile: ColumnProfile): number | null {
  return profile.cardinality.estimate;
}

function isAbsoluteUnit(unit: string | null): unit is DateTimeAbsoluteUnit {
  return dateTimeAbsoluteUnits.some((absolute) => absolute === unit);
}

function unitDays(profile: ColumnProfile): number {
  return isAbsoluteUnit(profile.unit) ? DAYS_PER_UNIT[profile.unit] : Infinity;
}

export function primaryTime(timeDims: ColumnProfile[]): ColumnProfile | null {
  if (timeDims.length === 0) {
    return null;
  }
  return timeDims.reduce((finest, candidate) =>
    unitDays(candidate) < unitDays(finest) ? candidate : finest,
  );
}

// Unknown cardinality sorts last so a known-small dimension is preferred.
export function byCardinality(a: ColumnProfile, b: ColumnProfile): number {
  const ca = cardinalityOf(a) ?? Infinity;
  const cb = cardinalityOf(b) ?? Infinity;
  return ca === cb ? a.index - b.index : ca - cb;
}

export function seriesDim(
  dims: ColumnProfile[],
  axis: ColumnProfile,
): ColumnProfile | null {
  const others = dims.filter((dim) => dim.index !== axis.index);
  return others.length === 0 ? null : [...others].sort(byCardinality)[0];
}

export function isAdditive(measure: ColumnProfile): boolean {
  return measure.agg?.additive ?? false;
}

export function isCumulative(measure: ColumnProfile): boolean {
  return measure.agg?.cumulative ?? false;
}

export function isShare(measure: ColumnProfile): boolean {
  return measure.agg?.share ?? false;
}

// Absent evidence of negatives a measure is assumed non-negative.
export function isNonNeg(measure: ColumnProfile): boolean {
  return measure.numeric?.allNonNeg ?? true;
}

export function labelsLong(dim: ColumnProfile): boolean {
  return dim.labelLength != null && dim.labelLength > THRESH.LABEL_LONG;
}

function semanticFamily(measure: ColumnProfile): string {
  const semantic = measure.semantic;
  if (isa(semantic, TYPE.Currency)) {
    return "currency";
  }
  if (isa(semantic, TYPE.Percentage) || isa(semantic, TYPE.Share)) {
    return "ratio";
  }
  return "plain";
}

function opFamily(measure: ColumnProfile): string {
  const op = measure.agg?.op;
  if (op == null || op === "unknown") {
    return "raw";
  }
  if (op === "share") {
    return "ratio";
  }
  return SCALE_FAMILY_PER_ROW_OPS.includes(op) ? "per-row" : "total";
}

function scaleFamily(measure: ColumnProfile): string {
  return `${opFamily(measure)}/${semanticFamily(measure)}`;
}

function avgRatioWithinBounds(measures: ColumnProfile[]): boolean {
  const avgs = measures
    .map((measure) => measure.numeric?.avg)
    .filter((avg): avg is number => avg != null && avg !== 0)
    .map(Math.abs);
  if (avgs.length < 2) {
    return true;
  }
  return Math.max(...avgs) / Math.min(...avgs) < THRESH.SAME_SCALE_RATIO;
}

export function sameScale(measures: ColumnProfile[]): boolean {
  if (measures.length < 2) {
    return true;
  }
  const families = new Set(measures.map(scaleFamily));
  return families.size === 1 && avgRatioWithinBounds(measures);
}

const DIM_ROLES: readonly ColumnRole[] = [
  "DIM_TIME",
  "DIM_CYCLIC",
  "DIM_BINNED",
  "DIM_CATEGORY",
  "DIM_ORDINAL_NUM",
  "DIM_NUMERIC",
  "DIM_GEO_LATLON",
  "DIM_GEO_REGION",
];

export function isDimensionRole(role: ColumnRole): boolean {
  return DIM_ROLES.includes(role);
}

type NEstimate = { N: number | null; exact: boolean };

export function estimateN(
  dims: ColumnProfile[],
  measures: ColumnProfile[],
  ctx: ShapeContext,
): NEstimate {
  if (ctx.rowCount != null) {
    return { N: ctx.rowCount, exact: ctx.rowCountExact };
  }
  if (!ctx.aggregated) {
    return { N: null, exact: false };
  }
  if (dims.length === 0) {
    return { N: measures.length > 0 ? 1 : null, exact: false };
  }
  const cardinalities = dims.map(cardinalityOf);
  if (cardinalities.some((c) => c == null)) {
    return { N: null, exact: false };
  }
  const product = cardinalities.reduce<number>((acc, c) => acc * (c ?? 1), 1);
  return { N: Math.min(product, CAPS.N_ESTIMATE_CAP), exact: false };
}

function byRole(profiles: ColumnProfile[], role: ColumnRole): ColumnProfile[] {
  return profiles.filter((profile) => profile.role === role);
}

export function summarizeShape(
  profiles: ColumnProfile[],
  ctx: ShapeContext,
): Shape {
  const M = byRole(profiles, "MEASURE");
  const Dt = byRole(profiles, "DIM_TIME");
  const Dcyc = byRole(profiles, "DIM_CYCLIC");
  const Dbin = byRole(profiles, "DIM_BINNED");
  const Dcat = [
    ...byRole(profiles, "DIM_CATEGORY"),
    ...byRole(profiles, "DIM_ORDINAL_NUM"),
  ];
  const Dnum = byRole(profiles, "DIM_NUMERIC");
  const Glatlon = byRole(profiles, "DIM_GEO_LATLON");
  const Gregion = byRole(profiles, "DIM_GEO_REGION");
  const D = profiles.filter((profile) => isDimensionRole(profile.role));
  const { N, exact } = estimateN(D, M, ctx);

  return {
    M,
    Dt,
    Dcyc,
    Dbin,
    Dcat,
    Dnum,
    Glatlon,
    Gregion,
    K: byRole(profiles, "KEY"),
    A: byRole(profiles, "ATTRIBUTE"),
    D,
    N,
    nExact: exact,
    aggregated: ctx.aggregated,
    isNative: ctx.isNative,
    allColsAggOrBreakout: profiles.every(
      (profile) =>
        profile.source === "aggregation" || profile.source === "breakout",
    ),
    colCount: profiles.length,
    primaryTime: primaryTime(Dt),
    sameScaleMeasures: sameScale(M),
    allAdditive: M.length > 0 && M.every(isAdditive),
    allNonNeg: M.length > 0 && M.every(isNonNeg),
    allShare: M.length > 0 && M.every(isShare),
  };
}
