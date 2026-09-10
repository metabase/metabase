import {
  ALT_ONLY_DISPLAYS,
  BAR_OVER_K6_PENALTY,
  CAPS,
  DISPLAY_ORDER,
  FUNNEL_NAME_RE,
  FUNNEL_UNVERIFIED_PENALTY,
  FUNNEL_VERIFIED_BONUS,
  K,
  RAW_ROWS_LINE_UNVERIFIED,
  SANKEY_NAME_RE,
  SCALAR_TOO_MANY_MEASURES_PENALTY,
  SERIES_TIE_BREAK_PER_UNIT,
  THRESH,
  W,
  seriesPenalty,
  xCardinalityPenalty,
} from "./constants";
import { applyHardConstraints } from "./constraints";
import {
  ALL_CHANNELS,
  AXIS_CHANNELS,
  type ProfileLookup,
  firstMapped,
  isCartesian,
  isStackedVariant,
  isTableLike,
  isTimeseriesDisplay,
  mapped,
  mappedOn,
  profileLookup,
} from "./mapping";
import {
  cardinalityOf,
  isAdditive,
  isCumulative,
  isNonNeg,
  isShare,
  labelsLong,
} from "./shape";
import type {
  Candidate,
  ColumnProfile,
  ColumnRole,
  PenaltyContribution,
  PenaltyId,
  RowStats,
  ScoredCandidate,
  Shape,
} from "./types";

type PenaltyContext = {
  shape: Shape;
  lookup: ProfileLookup;
  rowStats: RowStats | null;
  stage: 1 | 2;
};

type PenaltyValue = { value: number; detail: string } | null;
type PenaltyFn = (candidate: Candidate, ctx: PenaltyContext) => PenaltyValue;

const CATEGORICAL_X_ROLES: readonly ColumnRole[] = [
  "DIM_CATEGORY",
  "DIM_ORDINAL_NUM",
  "DIM_GEO_REGION",
];

const ORDERED_ROLES: readonly ColumnRole[] = [
  "DIM_CYCLIC",
  "DIM_BINNED",
  "DIM_ORDINAL_NUM",
  "DIM_NUMERIC",
  "DIM_TIME",
];

const NUMERIC_X_UNORDERED_PENALTY = 12;
const STAGE2_SERIES_OVERFLOW = 2;
const ADDITIVE_UNSTACKED_VALUE = 0.5;
const BINNED_X_LINE_VALUE = 0.2;

const hasXChannel = (candidate: Candidate): boolean =>
  candidate.mapping.x != null;

function xOf(candidate: Candidate, ctx: PenaltyContext): ColumnProfile | null {
  return firstMapped(candidate, "x", ctx.lookup);
}

function seriesOf(
  candidate: Candidate,
  ctx: PenaltyContext,
): ColumnProfile | null {
  return firstMapped(candidate, "series", ctx.lookup);
}

function metricsOf(candidate: Candidate, ctx: PenaltyContext): ColumnProfile[] {
  return mapped(candidate, "metrics", ctx.lookup);
}

const timeNotOnX: PenaltyFn = (candidate, ctx) => {
  const { primaryTime } = ctx.shape;
  if (primaryTime == null || !hasXChannel(candidate)) {
    return null;
  }
  const x = xOf(candidate, ctx);
  return x != null && x.index !== primaryTime.index
    ? { value: 1, detail: `${primaryTime.name} is not on the x axis` }
    : null;
};

const xCardinality: PenaltyFn = (candidate, ctx) => {
  const x = xOf(candidate, ctx);
  if (x == null || !CATEGORICAL_X_ROLES.includes(x.role)) {
    return null;
  }
  const card = cardinalityOf(x);
  if (card == null) {
    return null;
  }
  const overK6 = candidate.display === "bar" && card > K.K6_BAR_MAX_CATEGORIES;
  const value = xCardinalityPenalty(card) + (overK6 ? BAR_OVER_K6_PENALTY : 0);
  return value > 0 ? { value, detail: `${card} categories on x` } : null;
};

const seriesCardinality: PenaltyFn = (candidate, ctx) => {
  const series = seriesOf(candidate, ctx);
  const card = series ? cardinalityOf(series) : null;
  if (series == null || card == null) {
    return null;
  }
  return {
    value: seriesPenalty(card) + SERIES_TIE_BREAK_PER_UNIT * card,
    detail: `${card} series from ${series.name}`,
  };
};

const longLabelsVerticalBar: PenaltyFn = (candidate, ctx) => {
  const x = xOf(candidate, ctx);
  return candidate.display === "bar" && x != null && labelsLong(x)
    ? { value: 1, detail: `${x.name} labels are long` }
    : null;
};

const pieBaseline: PenaltyFn = (candidate) =>
  candidate.display === "pie"
    ? { value: 1, detail: "pie is rarely the best default" }
    : null;

const lineUnorderedX: PenaltyFn = (candidate, ctx) => {
  const x = xOf(candidate, ctx);
  if (x == null || !isTimeseriesDisplay(candidate.display)) {
    return null;
  }
  if (CATEGORICAL_X_ROLES.includes(x.role)) {
    return { value: 1, detail: `${x.name} has no natural order` };
  }
  return x.role === "DIM_BINNED"
    ? {
        value: BINNED_X_LINE_VALUE,
        detail: `${x.name} bins read better as bars`,
      }
    : null;
};

const barOnTimeX: PenaltyFn = (candidate, ctx) => {
  const x = xOf(candidate, ctx);
  const isBarLike = candidate.display === "bar" || candidate.display === "row";
  if (!isBarLike || x?.role !== "DIM_TIME") {
    return null;
  }
  const { N } = ctx.shape;
  return N == null || N > THRESH.BAR_ON_TIME_MIN_N
    ? { value: 1, detail: `bars over ${N ?? "many"} time buckets` }
    : null;
};

const measureDropped: PenaltyFn = (candidate, ctx) => {
  if (isTableLike(candidate.display) || candidate.display === "scalar") {
    return null;
  }
  const kept = new Set(
    mappedOn(candidate, ALL_CHANNELS, ctx.lookup).map(
      (profile) => profile.index,
    ),
  );
  const dropped = ctx.shape.M.filter((measure) => !kept.has(measure.index));
  return dropped.length > 0
    ? {
        value: dropped.length,
        detail: `drops ${dropped.map((m) => m.name).join(", ")}`,
      }
    : null;
};

const dimensionDropped: PenaltyFn = (candidate, ctx) => {
  if (isTableLike(candidate.display)) {
    return null;
  }
  const kept = new Set(
    mappedOn(candidate, ALL_CHANNELS, ctx.lookup).map(
      (profile) => profile.index,
    ),
  );
  const dropped = ctx.shape.D.filter((dim) => !kept.has(dim.index));
  return dropped.length > 0
    ? {
        value: dropped.length,
        detail: `drops ${dropped.map((d) => d.name).join(", ")}`,
      }
    : null;
};

const tableWhenChart: PenaltyFn = (candidate, ctx) => {
  const tabular =
    isTableLike(candidate.display) || candidate.display === "pivot";
  const chartable = ctx.shape.M.length > 0 || ctx.shape.Glatlon.length >= 2;
  return tabular && chartable
    ? { value: 1, detail: "a chart is feasible" }
    : null;
};

const pivotVsTableBonus: PenaltyFn = (candidate, ctx) =>
  candidate.display === "pivot" &&
  ctx.shape.aggregated &&
  ctx.shape.D.length >= 2
    ? { value: 1, detail: "pivot suits multiple breakouts" }
    : null;

const scatterAggregated: PenaltyFn = (candidate, ctx) =>
  candidate.display === "scatter" && ctx.shape.aggregated
    ? { value: 1, detail: "scatter over aggregated rows" }
    : null;

const regionMatch: PenaltyFn = (candidate, ctx) => {
  if (candidate.display !== "map" || candidate.variant !== "region") {
    return null;
  }
  const region = firstMapped(candidate, "region", ctx.lookup);
  const match = region
    ? (ctx.rowStats?.regionMatch[region.index] ?? region.geo?.regionMatch)
    : null;
  return match != null && match < THRESH.REGION_MATCH_MIN
    ? { value: 1 - match, detail: `region key match ${match.toFixed(2)}` }
    : null;
};

const comboManyMeasures: PenaltyFn = (candidate, ctx) =>
  candidate.display === "combo" && ctx.shape.M.length > 2
    ? { value: 1, detail: `${ctx.shape.M.length} measures on a combo` }
    : null;

const roleConfidence: PenaltyFn = (candidate, ctx) => {
  const axisCols = mappedOn(candidate, AXIS_CHANNELS, ctx.lookup);
  const value = axisCols.reduce(
    (sum, col) => sum + (1 - col.roleConfidence),
    0,
  );
  return value > 0
    ? { value, detail: "uncertain roles on axis columns" }
    : null;
};

const interestingness: PenaltyFn = (candidate, ctx) => {
  const x = xOf(candidate, ctx);
  return x?.interestingness != null && x.interestingness > 0
    ? {
        value: x.interestingness,
        detail: `${x.name} is an interesting breakout`,
      }
    : null;
};

const cumulativeNotLine: PenaltyFn = (candidate, ctx) => {
  const cumulative = metricsOf(candidate, ctx).some(isCumulative);
  return cumulative && !isTimeseriesDisplay(candidate.display)
    ? { value: 1, detail: "cumulative measures read best as a line" }
    : null;
};

const shareNotStacked: PenaltyFn = (candidate, ctx) => {
  if (!isCartesian(candidate.display) || isStackedVariant(candidate)) {
    return null;
  }
  const metrics = metricsOf(candidate, ctx);
  if (metrics.some(isShare)) {
    return { value: 1, detail: "share measures should stack" };
  }
  const stackable =
    seriesOf(candidate, ctx) != null &&
    metrics.every(isAdditive) &&
    metrics.every(isNonNeg);
  return stackable
    ? { value: ADDITIVE_UNSTACKED_VALUE, detail: "additive series could stack" }
    : null;
};

const rawRowsLine: PenaltyFn = (candidate, ctx) => {
  if (ctx.shape.aggregated || !isCartesian(candidate.display)) {
    return null;
  }
  const x = xOf(candidate, ctx);
  const timeStats = x ? ctx.rowStats?.timeSeries[x.index] : undefined;
  if (timeStats == null) {
    return {
      value: RAW_ROWS_LINE_UNVERIFIED,
      detail: "raw rows not yet verified as a series",
    };
  }
  return timeStats.allDistinct && !timeStats.regular
    ? {
        value: 1,
        detail: "every row has a distinct, irregular timestamp (event log)",
      }
    : null;
};

const scalarMultiMeasure: PenaltyFn = (candidate, ctx) => {
  if (candidate.display !== "scalar") {
    return null;
  }
  if (ctx.shape.M.length > K.K1_SCALAR_MAX_MEASURES) {
    return {
      value: SCALAR_TOO_MANY_MEASURES_PENALTY,
      detail: "too many measures for a scalar",
    };
  }
  const field = firstMapped(candidate, "scalarField", ctx.lookup);
  const position = ctx.shape.M.findIndex(
    (measure) => measure.index === field?.index,
  );
  return position > 0
    ? { value: position, detail: `${field?.name} is not the first measure` }
    : null;
};

const rowVsBarShortLabels: PenaltyFn = (candidate, ctx) => {
  const x = xOf(candidate, ctx);
  if (candidate.display !== "row" || x == null) {
    return null;
  }
  return !labelsLong(x)
    ? { value: 1, detail: "short labels fit a vertical bar" }
    : null;
};

function isSankeyLike(candidate: Candidate, ctx: PenaltyContext): boolean {
  return mappedOn(candidate, ["source", "target"], ctx.lookup).every((col) =>
    SANKEY_NAME_RE.test(col.name),
  );
}

const altOnlyDisplay: PenaltyFn = (candidate, ctx) => {
  const secondary =
    ALT_ONLY_DISPLAYS.includes(candidate.display) ||
    candidate.display === "pie" ||
    candidate.display === "treemap" ||
    (candidate.display === "sankey" && !isSankeyLike(candidate, ctx));
  return secondary
    ? { value: 1, detail: "offered as an alternative only" }
    : null;
};

function isFunnelVerified(
  x: ColumnProfile,
  rowStats: RowStats | null,
): boolean {
  if (rowStats == null) {
    return false;
  }
  const nonIncreasing = rowStats.nonIncreasing[x.index] === true;
  const tau = rowStats.kendallTau[x.index];
  const namedFunnel =
    FUNNEL_NAME_RE.test(x.name) && tau != null && tau <= THRESH.FUNNEL_TAU;
  return nonIncreasing || namedFunnel;
}

const funnelShape: PenaltyFn = (candidate, ctx) => {
  const x = xOf(candidate, ctx);
  if (candidate.display !== "funnel" || x == null) {
    return null;
  }
  return isFunnelVerified(x, ctx.rowStats)
    ? { value: FUNNEL_VERIFIED_BONUS, detail: "steps decrease in order" }
    : { value: FUNNEL_UNVERIFIED_PENALTY, detail: "funnel order not verified" };
};

const numericXOrder: PenaltyFn = (candidate, ctx) => {
  const x = xOf(candidate, ctx);
  if (x?.role !== "DIM_NUMERIC") {
    return null;
  }
  const card = cardinalityOf(x);
  const isBarLike = candidate.display === "bar" || candidate.display === "row";
  if (isBarLike) {
    return card != null && card > CAPS.DNUM_BAR_MAX_CARD
      ? {
          value: NUMERIC_X_UNORDERED_PENALTY,
          detail: `${card} numeric values as bars`,
        }
      : null;
  }
  if (!isTimeseriesDisplay(candidate.display)) {
    return null;
  }
  const order = ctx.rowStats?.numericX[x.index];
  return order?.monotone && order.evenlySpaced
    ? null
    : {
        value: NUMERIC_X_UNORDERED_PENALTY,
        detail: "numeric x not known to be evenly spaced",
      };
};

const provisionalOverflow: PenaltyFn = (candidate, ctx) => {
  const series = seriesOf(candidate, ctx);
  const card = series ? cardinalityOf(series) : null;
  const exact = series?.cardinality.exact ?? false;
  return ctx.stage === 2 && exact && card != null && card > K.K4_LINE_MAX_SERIES
    ? { value: STAGE2_SERIES_OVERFLOW, detail: `${card} series confirmed` }
    : null;
};

const SHARED_AXIS_VARIANTS = new Set([null, "grouped", "histogram", "ordinal"]);

const mixedScaleSharedAxis: PenaltyFn = (candidate, ctx) => {
  const metrics = metricsOf(candidate, ctx);
  const sharedAxis =
    isCartesian(candidate.display) &&
    candidate.display !== "combo" &&
    SHARED_AXIS_VARIANTS.has(candidate.variant);
  return sharedAxis && metrics.length >= 2 && !ctx.shape.sameScaleMeasures
    ? { value: 1, detail: "measures on different scales share one axis" }
    : null;
};

const secondaryDisplay: PenaltyFn = (candidate, ctx) => {
  const metrics = metricsOf(candidate, ctx);
  if (candidate.variant === "normalized" && !ctx.shape.allShare) {
    return { value: 1, detail: "normalized stacking suits share measures" };
  }
  if (candidate.display === "area") {
    const stackedShares = isStackedVariant(candidate) && ctx.shape.allShare;
    return metrics.some(isCumulative) || stackedShares
      ? null
      : { value: 1, detail: "area is secondary to line" };
  }
  if (candidate.display === "combo") {
    return { value: 1, detail: "combo is secondary to a split-axis line" };
  }
  if (candidate.display === "line" && candidate.variant === "auto-split") {
    return ctx.shape.sameScaleMeasures
      ? { value: 1, detail: "same-scale measures share one axis" }
      : null;
  }
  return null;
};

const orderedDimAsSeries: PenaltyFn = (candidate, ctx) => {
  const x = xOf(candidate, ctx);
  const series = seriesOf(candidate, ctx);
  if (x == null || series == null || x.role === "DIM_TIME") {
    return null;
  }
  return ORDERED_ROLES.includes(series.role) && !ORDERED_ROLES.includes(x.role)
    ? { value: 1, detail: `${series.name} is ordered and belongs on the axis` }
    : null;
};

const geoDimOnAxis: PenaltyFn = (candidate, ctx) => {
  const geo = mappedOn(candidate, ["x", "series"], ctx.lookup).filter(
    (col) => col.role === "DIM_GEO_LATLON",
  );
  return geo.length > 0
    ? { value: geo.length, detail: "coordinates belong on a map" }
    : null;
};

const tableNoMiniBar: PenaltyFn = (candidate, ctx) => {
  const miniBarPossible =
    ctx.shape.aggregated && ctx.shape.M.length > 0 && ctx.shape.D.length > 0;
  return candidate.display === "table" &&
    candidate.variant == null &&
    miniBarPossible
    ? { value: 1, detail: "a mini bar keeps the metric readable" }
    : null;
};

const PENALTIES: ReadonlyArray<[PenaltyId, PenaltyFn]> = [
  ["time-not-on-x", timeNotOnX],
  ["x-cardinality", xCardinality],
  ["series-cardinality", seriesCardinality],
  ["long-labels-vertical-bar", longLabelsVerticalBar],
  ["pie-baseline", pieBaseline],
  ["line-unordered-x", lineUnorderedX],
  ["bar-on-time-x", barOnTimeX],
  ["measure-dropped", measureDropped],
  ["dimension-dropped", dimensionDropped],
  ["table-when-chart", tableWhenChart],
  ["pivot-vs-table-bonus", pivotVsTableBonus],
  ["scatter-aggregated", scatterAggregated],
  ["region-match", regionMatch],
  ["combo-many-measures", comboManyMeasures],
  ["role-confidence", roleConfidence],
  ["interestingness", interestingness],
  ["cumulative-not-line", cumulativeNotLine],
  ["share-not-stacked", shareNotStacked],
  ["raw-rows-line", rawRowsLine],
  ["scalar-multi-measure", scalarMultiMeasure],
  ["row-vs-bar-short-labels", rowVsBarShortLabels],
  ["alt-only-display", altOnlyDisplay],
  ["funnel-shape", funnelShape],
  ["numeric-x-order", numericXOrder],
  ["provisional-overflow", provisionalOverflow],
  ["mixed-scale-shared-axis", mixedScaleSharedAxis],
  ["secondary-display", secondaryDisplay],
  ["ordered-dim-as-series", orderedDimAsSeries],
  ["geo-dim-on-axis", geoDimOnAxis],
  ["table-no-mini-bar", tableNoMiniBar],
];

export function scoreCandidate(
  candidate: Candidate,
  shape: Shape,
  profiles: ColumnProfile[],
  rowStats: RowStats | null,
  stage: 1 | 2,
): PenaltyContribution[] {
  const ctx: PenaltyContext = {
    shape,
    lookup: profileLookup(profiles),
    rowStats,
    stage,
  };
  return PENALTIES.flatMap(([id, penalty]) => {
    const result = penalty(candidate, ctx);
    if (result == null) {
      return [];
    }
    const weight = W[id];
    return [
      {
        id,
        weight,
        value: result.value,
        contribution: weight * result.value,
        detail: result.detail,
      },
    ];
  });
}

export function totalScore(penalties: PenaltyContribution[]): number {
  return penalties.reduce((sum, penalty) => sum + penalty.contribution, 0);
}

function displayRank(candidate: Candidate): number {
  const rank = DISPLAY_ORDER.indexOf(candidate.display);
  return rank === -1 ? DISPLAY_ORDER.length : rank;
}

export function compareScored(a: ScoredCandidate, b: ScoredCandidate): number {
  if (a.score !== b.score) {
    return a.score - b.score;
  }
  const rankDiff = displayRank(a) - displayRank(b);
  return rankDiff !== 0 ? rankDiff : a.id.localeCompare(b.id);
}

export function rankCandidates(
  candidates: Candidate[],
  shape: Shape,
  profiles: ColumnProfile[],
  rowStats: RowStats | null,
  stage: 1 | 2,
): ScoredCandidate[] {
  return candidates
    .map((candidate): ScoredCandidate => {
      const hardFailures = applyHardConstraints(
        candidate,
        shape,
        profiles,
        rowStats,
      );
      const feasible = hardFailures.length === 0;
      const penalties = feasible
        ? scoreCandidate(candidate, shape, profiles, rowStats, stage)
        : [];
      return {
        ...candidate,
        feasible,
        hardFailures,
        penalties,
        score: feasible ? totalScore(penalties) : Infinity,
      };
    })
    .sort(compareScored);
}

export function pickAlternatives(
  ranked: ScoredCandidate[],
  chosen: ScoredCandidate,
  count: number = CAPS.ALTERNATIVES,
): ScoredCandidate[] {
  const seen = new Set([chosen.display]);
  const alternatives: ScoredCandidate[] = [];
  for (const candidate of ranked) {
    if (alternatives.length >= count) {
      break;
    }
    if (candidate.feasible && !seen.has(candidate.display)) {
      seen.add(candidate.display);
      alternatives.push(candidate);
    }
  }
  return alternatives;
}
