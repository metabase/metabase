import { CAPS, K, THRESH } from "./constants";
import {
  AXIS_CHANNELS,
  MEASURE_CHANNELS,
  type ProfileLookup,
  firstMapped,
  isCartesian,
  isStackedVariant,
  isTimeseriesDisplay,
  mapped,
  mappedOn,
  profileLookup,
} from "./mapping";
import { cardinalityOf, isAdditive } from "./shape";
import type {
  Candidate,
  ColumnProfile,
  HardConstraintId,
  HardFailure,
  RowStats,
  Shape,
} from "./types";

type ConstraintContext = {
  shape: Shape;
  lookup: ProfileLookup;
  rowStats: RowStats | null;
};

type ConstraintFn = (
  candidate: Candidate,
  ctx: ConstraintContext,
) => string | null;

const fail = (id: HardConstraintId, detail: string): HardFailure => ({
  id,
  detail,
});

function isPlotDisplay(candidate: Candidate): boolean {
  return !["table", "object", "scalar"].includes(candidate.display);
}

const cartesianNeedsDimAndMeasure: ConstraintFn = (candidate, ctx) => {
  if (!isCartesian(candidate.display) && candidate.display !== "scatter") {
    return null;
  }
  const hasX = mapped(candidate, "x", ctx.lookup).length > 0;
  const hasMetric = mapped(candidate, "metrics", ctx.lookup).length > 0;
  return hasX && hasMetric ? null : "needs an x column and a metric";
};

const nMustExceed1: ConstraintFn = (candidate, ctx) => {
  const { N } = ctx.shape;
  return isPlotDisplay(candidate) && N != null && N <= 1
    ? `N=${N} rows cannot be plotted`
    : null;
};

const seriesOverMax: ConstraintFn = (candidate, ctx) => {
  const series = firstMapped(candidate, "series", ctx.lookup);
  const card = series ? cardinalityOf(series) : null;
  return card != null && card > CAPS.MAX_SERIES
    ? `${card} series exceeds ${CAPS.MAX_SERIES}`
    : null;
};

const pivotNeedsAggBreakout: ConstraintFn = (candidate, ctx) =>
  candidate.display === "pivot" && !ctx.shape.allColsAggOrBreakout
    ? "pivot needs every column to be an aggregation or breakout"
    : null;

const pivotNotNative: ConstraintFn = (candidate, ctx) =>
  candidate.display === "pivot" && ctx.shape.isNative
    ? "pivot is not available for native queries"
    : null;

const sankeyCycleOrNodes: ConstraintFn = (candidate, ctx) => {
  if (candidate.display !== "sankey") {
    return null;
  }
  const nodes = mappedOn(candidate, ["source", "target"], ctx.lookup).reduce(
    (sum, profile) => sum + (cardinalityOf(profile) ?? 0),
    0,
  );
  return nodes > CAPS.SANKEY_MAX_NODES
    ? `${nodes} nodes exceeds ${CAPS.SANKEY_MAX_NODES}`
    : null;
};

const regionNeedsKeys: ConstraintFn = (candidate, ctx) => {
  if (candidate.display !== "map" || candidate.variant !== "region") {
    return null;
  }
  const region = firstMapped(candidate, "region", ctx.lookup);
  if (region?.role !== "DIM_GEO_REGION") {
    return "region map needs a state or country column";
  }
  const match =
    ctx.rowStats?.regionMatch[region.index] ?? region.geo?.regionMatch;
  return match != null && match < THRESH.REGION_MATCH_MIN
    ? `only ${Math.round(match * 100)}% of values are region keys`
    : null;
};

function coordinates(
  candidate: Candidate,
  lookup: ProfileLookup,
): { lat: ColumnProfile | null; lon: ColumnProfile | null } {
  return {
    lat: firstMapped(candidate, "lat", lookup),
    lon: firstMapped(candidate, "lon", lookup),
  };
}

const pinNeedsLatlon: ConstraintFn = (candidate, ctx) => {
  if (candidate.display !== "map" || candidate.variant !== "pin") {
    return null;
  }
  const { lat, lon } = coordinates(candidate, ctx.lookup);
  if (lat?.geo?.kind !== "lat" || lon?.geo?.kind !== "lon") {
    return "pin map needs latitude and longitude columns";
  }
  return lat.binning != null || lon.binning != null
    ? "pin map needs unbinned coordinates"
    : null;
};

const scalarNeedsN1: ConstraintFn = (candidate, ctx) => {
  if (candidate.display !== "scalar") {
    return null;
  }
  const { N, D, aggregated } = ctx.shape;
  if (N != null) {
    return N === 1 ? null : `scalar needs exactly one row, N=${N}`;
  }
  return aggregated && D.length === 0
    ? null
    : "row count unknown and the result is not a single aggregate";
};

const funnelOneDimOneMeasure: ConstraintFn = (candidate, ctx) => {
  if (candidate.display !== "funnel") {
    return null;
  }
  const dim = firstMapped(candidate, "x", ctx.lookup);
  const metricCount = mapped(candidate, "metrics", ctx.lookup).length;
  if (dim == null || metricCount !== 1) {
    return "funnel needs one dimension and one measure";
  }
  const card = cardinalityOf(dim);
  const withinRange =
    card == null || (card >= CAPS.FUNNEL_MIN && card <= CAPS.FUNNEL_MAX);
  return withinRange
    ? null
    : `funnel needs ${CAPS.FUNNEL_MIN}-${CAPS.FUNNEL_MAX} steps, got ${card}`;
};

const keyNotMeasure: ConstraintFn = (candidate, ctx) => {
  const key = mappedOn(candidate, MEASURE_CHANNELS, ctx.lookup).find(
    (profile) => profile.role === "KEY",
  );
  return key ? `${key.name} is a key, not a measure` : null;
};

const attributeNotAxis: ConstraintFn = (candidate, ctx) => {
  const attribute = mappedOn(candidate, AXIS_CHANNELS, ctx.lookup).find(
    (profile) => profile.role === "ATTRIBUTE",
  );
  return attribute ? `${attribute.name} is an attribute, not an axis` : null;
};

const extractionNotTimeseries: ConstraintFn = (candidate, ctx) => {
  if (!isTimeseriesDisplay(candidate.display)) {
    return null;
  }
  const x = firstMapped(candidate, "x", ctx.lookup);
  return x?.role === "DIM_CYCLIC" || x?.unitKind === "extraction"
    ? `${x.name} is a cyclic extraction, not a time axis`
    : null;
};

function hasNegativeValues(
  measure: ColumnProfile,
  rowStats: RowStats | null,
): boolean {
  return (
    rowStats?.allNonNeg[measure.index] === false ||
    measure.numeric?.allNonNeg === false
  );
}

const pieSlicesOrAdditiveOrNegative: ConstraintFn = (candidate, ctx) => {
  if (candidate.display !== "pie") {
    return null;
  }
  const dim = firstMapped(candidate, "x", ctx.lookup);
  const metric = firstMapped(candidate, "metrics", ctx.lookup);
  if (dim == null || metric == null) {
    return "pie needs one dimension and one measure";
  }
  if (
    dim.role === "DIM_ORDINAL_NUM" ||
    dim.role === "DIM_CYCLIC" ||
    dim.role === "DIM_TIME"
  ) {
    return `${dim.name} is ordered, not a share dimension`;
  }
  if (!isAdditive(metric)) {
    return `${metric.name} is not additive`;
  }
  if (hasNegativeValues(metric, ctx.rowStats)) {
    return `${metric.name} has negative values`;
  }
  const slices = ctx.rowStats?.pieSlices[dim.index] ?? cardinalityOf(dim);
  if (slices != null && slices > K.K5_PIE_MAX_SLICES) {
    return `${slices} slices exceeds ${K.K5_PIE_MAX_SLICES}`;
  }
  const topShare = ctx.rowStats?.topShare[dim.index];
  return topShare != null && topShare > THRESH.PIE_TOP_SHARE
    ? "one slice dominates the pie"
    : null;
};

const stackedNonAdditive: ConstraintFn = (candidate, ctx) => {
  if (!isStackedVariant(candidate)) {
    return null;
  }
  const nonAdditive = mapped(candidate, "metrics", ctx.lookup).find(
    (metric) => !isAdditive(metric),
  );
  return nonAdditive ? `${nonAdditive.name} cannot be stacked` : null;
};

const gridNeedsBinnedLatlon: ConstraintFn = (candidate, ctx) => {
  if (candidate.display !== "map" || candidate.variant !== "grid") {
    return null;
  }
  const { lat, lon } = coordinates(candidate, ctx.lookup);
  return lat?.binning != null && lon?.binning != null
    ? null
    : "grid map needs binned latitude and longitude";
};

const objectNeedsPkN1: ConstraintFn = (candidate, ctx) => {
  if (candidate.display !== "object") {
    return null;
  }
  const { N, K: keys, aggregated } = ctx.shape;
  return N === 1 && keys.length > 0 && !aggregated
    ? null
    : "object detail needs a single raw row with a primary key";
};

const treemapCaps: ConstraintFn = (candidate, ctx) => {
  if (candidate.display !== "treemap") {
    return null;
  }
  const grouping = firstMapped(candidate, "grouping", ctx.lookup);
  const subGrouping = firstMapped(candidate, "subGrouping", ctx.lookup);
  const groupingCard = grouping ? cardinalityOf(grouping) : null;
  const subCard = subGrouping ? cardinalityOf(subGrouping) : null;
  if (groupingCard != null && groupingCard > CAPS.TREEMAP_MAX_AXIS) {
    return `${groupingCard} groups exceeds ${CAPS.TREEMAP_MAX_AXIS}`;
  }
  return subCard != null && subCard > CAPS.TREEMAP_MAX_SERIES
    ? `${subCard} sub-groups exceeds ${CAPS.TREEMAP_MAX_SERIES}`
    : null;
};

const boxplotNeedsRaw: ConstraintFn = (candidate, ctx) =>
  candidate.display === "boxplot" && ctx.shape.aggregated
    ? "box plot needs raw rows"
    : null;

const scatterNeedsNumeric: ConstraintFn = (candidate, ctx) => {
  if (candidate.display !== "scatter") {
    return null;
  }
  const nonNumeric = mappedOn(
    candidate,
    ["x", "metrics", "bubble"],
    ctx.lookup,
  ).find((profile) => profile.type !== "number");
  return nonNumeric ? `${nonNumeric.name} is not numeric` : null;
};

const CONSTRAINTS: ReadonlyArray<[HardConstraintId, ConstraintFn]> = [
  ["cartesian-needs-dim-and-measure", cartesianNeedsDimAndMeasure],
  ["n-must-exceed-1", nMustExceed1],
  ["series-over-max", seriesOverMax],
  ["pivot-needs-agg-breakout", pivotNeedsAggBreakout],
  ["pivot-not-native", pivotNotNative],
  ["sankey-cycle-or-nodes", sankeyCycleOrNodes],
  ["region-needs-keys", regionNeedsKeys],
  ["pin-needs-latlon", pinNeedsLatlon],
  ["scalar-needs-n1", scalarNeedsN1],
  ["funnel-one-dim-one-measure", funnelOneDimOneMeasure],
  ["key-not-measure", keyNotMeasure],
  ["attribute-not-axis", attributeNotAxis],
  ["extraction-not-timeseries", extractionNotTimeseries],
  ["pie-slices-or-additive-or-negative", pieSlicesOrAdditiveOrNegative],
  ["stacked-non-additive", stackedNonAdditive],
  ["grid-needs-binned-latlon", gridNeedsBinnedLatlon],
  ["object-needs-pk-n1", objectNeedsPkN1],
  ["treemap-caps", treemapCaps],
  ["boxplot-needs-raw", boxplotNeedsRaw],
  ["scatter-needs-numeric", scatterNeedsNumeric],
];

export function applyHardConstraints(
  candidate: Candidate,
  shape: Shape,
  profiles: ColumnProfile[],
  rowStats: RowStats | null,
): HardFailure[] {
  const ctx: ConstraintContext = {
    shape,
    lookup: profileLookup(profiles),
    rowStats,
  };
  return CONSTRAINTS.flatMap(([id, check]) => {
    const detail = check(candidate, ctx);
    return detail == null ? [] : [fail(id, detail)];
  });
}
