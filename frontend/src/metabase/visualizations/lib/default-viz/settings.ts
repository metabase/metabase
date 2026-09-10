import { match } from "ts-pattern";

import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isa } from "metabase-lib/v1/types/utils/isa";
import type {
  ColumnSettings,
  SeriesSettings,
  VisualizationSettings,
  XAxisScale,
} from "metabase-types/api";

import { CAPS, THRESH } from "./constants";
import {
  ALL_CHANNELS,
  type ProfileLookup,
  firstMapped,
  isCartesian,
  mapped,
  profileLookup,
} from "./mapping";
import { cardinalityOf, isAdditive, labelsLong } from "./shape";
import type {
  Candidate,
  Channel,
  ColumnProfile,
  RowStats,
  Shape,
  SuggestedOrderBy,
} from "./types";

type Settings = Partial<VisualizationSettings>;

export type SettingsResult = {
  settings: Settings;
  suggestedOrderBy: SuggestedOrderBy;
};

type SettingsContext = {
  shape: Shape;
  lookup: ProfileLookup;
  rowStats: RowStats | null;
};

const NO_ORDER: SuggestedOrderBy = null;

const names = (profiles: ColumnProfile[]): string[] =>
  profiles.map((profile) => profile.name);

const columnKeyOf = (profile: ColumnProfile): string =>
  getColumnKey({ name: profile.name });

function numberStyleFor(measure: ColumnProfile): ColumnSettings | null {
  if (isa(measure.semantic, TYPE.Currency)) {
    return { number_style: "currency" };
  }
  if (
    isa(measure.semantic, TYPE.Percentage) ||
    isa(measure.semantic, TYPE.Share)
  ) {
    return { number_style: "percent" };
  }
  return null;
}

function columnSettingsFor(measures: ColumnProfile[]): Settings {
  const entries = measures.flatMap((measure) => {
    const style = numberStyleFor(measure);
    return style ? [[columnKeyOf(measure), style] as const] : [];
  });
  return entries.length > 0
    ? { column_settings: Object.fromEntries(entries) }
    : {};
}

function scalarSettings(
  candidate: Candidate,
  ctx: SettingsContext,
): SettingsResult {
  const field = firstMapped(candidate, "scalarField", ctx.lookup);
  const settings: Settings = {
    ...(field && ctx.shape.colCount >= 2 ? { "scalar.field": field.name } : {}),
    ...(field ? columnSettingsFor([field]) : {}),
  };
  return { settings, suggestedOrderBy: NO_ORDER };
}

export function xAxisScale(x: ColumnProfile): XAxisScale {
  return match(x.role)
    .returnType<XAxisScale>()
    .with("DIM_TIME", () => "timeseries")
    .with("DIM_BINNED", () => "histogram")
    .with("DIM_NUMERIC", () => "linear")
    .otherwise(() => "ordinal");
}

function axisEnabled(
  candidate: Candidate,
  x: ColumnProfile,
): VisualizationSettings["graph.x_axis.axis_enabled"] | undefined {
  const card = cardinalityOf(x);
  if (candidate.display !== "bar" || card == null) {
    return undefined;
  }
  if (card > THRESH.COMPACT_MIN_CARD) {
    return "compact";
  }
  return card > THRESH.ROTATE_45_MIN_CARD && labelsLong(x)
    ? "rotate-45"
    : undefined;
}

function stackType(
  candidate: Candidate,
): VisualizationSettings["stackable.stack_type"] {
  return match(candidate.variant)
    .with("stacked", () => "stacked" as const)
    .with("normalized", () => "normalized" as const)
    .otherwise(() => undefined);
}

function isCountLike(measure: ColumnProfile): boolean {
  const op = measure.agg?.op;
  return (
    op === "count" ||
    op === "cum-count" ||
    op === "distinct" ||
    op === "count-where"
  );
}

function comboSeriesSettings(
  metrics: ColumnProfile[],
): Record<string, SeriesSettings> {
  return Object.fromEntries(
    metrics.map((metric) => [
      metric.name,
      { display: isCountLike(metric) ? ("bar" as const) : ("line" as const) },
    ]),
  );
}

function missingBucketSettings(
  x: ColumnProfile,
  metrics: ColumnProfile[],
  rowStats: RowStats | null,
): Record<string, SeriesSettings> {
  const stats = rowStats?.timeSeries[x.index];
  if (stats == null || stats.missingBucketFrac <= THRESH.MISSING_BUCKET_FRAC) {
    return {};
  }
  return Object.fromEntries(
    metrics.map((metric) => [metric.name, { "line.missing": "none" }]),
  );
}

function mergeSeriesSettings(
  ...groups: Record<string, SeriesSettings>[]
): Settings {
  const merged: Record<string, SeriesSettings> = {};
  for (const group of groups) {
    for (const [key, value] of Object.entries(group)) {
      merged[key] = { ...merged[key], ...value };
    }
  }
  return Object.keys(merged).length > 0 ? { series_settings: merged } : {};
}

function showValues(
  candidate: Candidate,
  ctx: SettingsContext,
  metrics: ColumnProfile[],
): boolean {
  const { N } = ctx.shape;
  const barLike = candidate.display === "bar" || candidate.display === "row";
  return (
    barLike &&
    metrics.length === 1 &&
    N != null &&
    N <= THRESH.SHOW_VALUES_MAX_N
  );
}

function isCategoricalX(x: ColumnProfile): boolean {
  return x.role === "DIM_CATEGORY" || x.role === "DIM_GEO_REGION";
}

function cartesianOrderBy(
  candidate: Candidate,
  x: ColumnProfile,
  metrics: ColumnProfile[],
): SuggestedOrderBy {
  const barLike = candidate.display === "bar" || candidate.display === "row";
  const [metric] = metrics;
  return barLike && metric && isCategoricalX(x)
    ? { columnName: metric.name, direction: "desc" }
    : NO_ORDER;
}

function cartesianSettings(
  candidate: Candidate,
  ctx: SettingsContext,
): SettingsResult {
  const x = firstMapped(candidate, "x", ctx.lookup);
  const series = firstMapped(candidate, "series", ctx.lookup);
  const metrics = mapped(candidate, "metrics", ctx.lookup);
  if (x == null) {
    return { settings: {}, suggestedOrderBy: NO_ORDER };
  }
  const axis = axisEnabled(candidate, x);
  const stack = stackType(candidate);
  const settings: Settings = {
    "graph.dimensions": names(series ? [x, series] : [x]),
    "graph.metrics": names(metrics),
    "graph.x_axis.scale": xAxisScale(x),
    ...(axis != null ? { "graph.x_axis.axis_enabled": axis } : {}),
    ...(stack != null ? { "stackable.stack_type": stack } : {}),
    ...(candidate.variant === "auto-split"
      ? { "graph.y_axis.auto_split": true }
      : {}),
    ...(showValues(candidate, ctx, metrics)
      ? { "graph.show_values": true }
      : {}),
    ...mergeSeriesSettings(
      candidate.display === "combo" ? comboSeriesSettings(metrics) : {},
      x.role === "DIM_TIME"
        ? missingBucketSettings(x, metrics, ctx.rowStats)
        : {},
    ),
    ...columnSettingsFor(metrics),
  };
  return {
    settings,
    suggestedOrderBy: cartesianOrderBy(candidate, x, metrics),
  };
}

function scatterSettings(
  candidate: Candidate,
  ctx: SettingsContext,
): SettingsResult {
  const x = firstMapped(candidate, "x", ctx.lookup);
  const y = firstMapped(candidate, "metrics", ctx.lookup);
  const bubble = firstMapped(candidate, "bubble", ctx.lookup);
  const series = firstMapped(candidate, "series", ctx.lookup);
  const dimensions = [x, series].filter(
    (profile): profile is ColumnProfile => profile != null,
  );
  const settings: Settings = {
    "graph.dimensions": names(dimensions),
    "graph.metrics": y ? [y.name] : [],
    ...(bubble ? { "scatter.bubble": bubble.name } : {}),
  };
  return { settings, suggestedOrderBy: NO_ORDER };
}

function pieSettings(
  candidate: Candidate,
  ctx: SettingsContext,
): SettingsResult {
  const dim = firstMapped(candidate, "x", ctx.lookup);
  const metric = firstMapped(candidate, "metrics", ctx.lookup);
  const settings: Settings = {
    "pie.dimension": dim ? [dim.name] : [],
    ...(metric ? { "pie.metric": metric.name } : {}),
    "pie.show_legend": true,
    "pie.percent_visibility": "legend",
    "pie.slice_threshold": THRESH.PIE_SLICE_THRESHOLD,
  };
  return { settings, suggestedOrderBy: NO_ORDER };
}

function funnelSettings(
  candidate: Candidate,
  ctx: SettingsContext,
): SettingsResult {
  const dim = firstMapped(candidate, "x", ctx.lookup);
  const metric = firstMapped(candidate, "metrics", ctx.lookup);
  const settings: Settings = {
    ...(dim ? { "funnel.dimension": dim.name } : {}),
    ...(metric ? { "funnel.metric": metric.name } : {}),
    "funnel.type": "funnel",
  };
  return { settings, suggestedOrderBy: NO_ORDER };
}

function mapSettings(
  candidate: Candidate,
  ctx: SettingsContext,
): SettingsResult {
  const metric = firstMapped(candidate, "metrics", ctx.lookup);
  const lat = firstMapped(candidate, "lat", ctx.lookup);
  const lon = firstMapped(candidate, "lon", ctx.lookup);
  const region = firstMapped(candidate, "region", ctx.lookup);
  const { N } = ctx.shape;
  const settings = match(candidate.variant)
    .returnType<Settings>()
    .with("region", () => ({
      "map.type": "region",
      ...(region?.geo?.region ? { "map.region": region.geo.region } : {}),
      ...(region ? { "map.dimension": region.name } : {}),
      ...(metric ? { "map.metric": metric.name } : {}),
    }))
    .with("pin", () => ({
      "map.type": "pin",
      ...(lat ? { "map.latitude_column": lat.name } : {}),
      ...(lon ? { "map.longitude_column": lon.name } : {}),
      "map.pin_type":
        N != null && N >= CAPS.PIN_TILES_MIN_N ? "tiles" : "markers",
    }))
    .with("grid", () => ({
      "map.type": "grid",
      ...(lat ? { "map.latitude_column": lat.name } : {}),
      ...(lon ? { "map.longitude_column": lon.name } : {}),
      ...(metric ? { "map.metric_column": metric.name } : {}),
    }))
    .otherwise(() => ({}));
  return { settings, suggestedOrderBy: NO_ORDER };
}

function pivotSettings(
  candidate: Candidate,
  ctx: SettingsContext,
): SettingsResult {
  const metrics = mapped(candidate, "metrics", ctx.lookup);
  const onlyNonAdditive =
    metrics.length > 0 && metrics.every((metric) => !isAdditive(metric));
  const settings: Settings = {
    "pivot_table.column_split": {
      rows: names(mapped(candidate, "pivotRows", ctx.lookup)),
      columns: names(mapped(candidate, "pivotColumns", ctx.lookup)),
      values: names(metrics),
    },
    ...(onlyNonAdditive
      ? { "pivot.show_row_totals": false, "pivot.show_column_totals": false }
      : {}),
  };
  return { settings, suggestedOrderBy: NO_ORDER };
}

function tableSettings(
  candidate: Candidate,
  ctx: SettingsContext,
): SettingsResult {
  const metric = firstMapped(candidate, "metrics", ctx.lookup);
  const series = firstMapped(candidate, "series", ctx.lookup);
  const seriesCard = series ? cardinalityOf(series) : null;
  const settings = match(candidate.variant)
    .returnType<Settings>()
    .with("mini-bar", () =>
      metric
        ? {
            column_settings: { [columnKeyOf(metric)]: { show_mini_bar: true } },
          }
        : {},
    )
    .with("table-pivot", () =>
      series &&
      metric &&
      seriesCard != null &&
      seriesCard <= CAPS.PIVOT_TABLE_MAX_CARD
        ? {
            "table.pivot": true,
            "table.pivot_column": series.name,
            "table.cell_column": metric.name,
          }
        : {},
    )
    .otherwise(() => ({}));
  return { settings, suggestedOrderBy: NO_ORDER };
}

function sankeySettings(
  candidate: Candidate,
  ctx: SettingsContext,
): SettingsResult {
  const source = firstMapped(candidate, "source", ctx.lookup);
  const target = firstMapped(candidate, "target", ctx.lookup);
  const value = firstMapped(candidate, "value", ctx.lookup);
  const settings: Settings = {
    ...(source ? { "sankey.source": source.name } : {}),
    ...(target ? { "sankey.target": target.name } : {}),
    ...(value ? { "sankey.value": value.name } : {}),
  };
  return { settings, suggestedOrderBy: NO_ORDER };
}

function treemapSettings(
  candidate: Candidate,
  ctx: SettingsContext,
): SettingsResult {
  const grouping = firstMapped(candidate, "grouping", ctx.lookup);
  const subGrouping = firstMapped(candidate, "subGrouping", ctx.lookup);
  const value = firstMapped(candidate, "value", ctx.lookup);
  const settings: Settings = {
    ...(grouping ? { "treemap.grouping": grouping.name } : {}),
    ...(subGrouping ? { "treemap.sub_grouping": subGrouping.name } : {}),
    ...(value ? { "treemap.value": value.name } : {}),
  };
  return { settings, suggestedOrderBy: NO_ORDER };
}

export function settingsFor(
  candidate: Candidate,
  shape: Shape,
  profiles: ColumnProfile[],
  rowStats: RowStats | null,
): SettingsResult {
  const ctx: SettingsContext = {
    shape,
    lookup: profileLookup(profiles),
    rowStats,
  };
  return match(candidate.display)
    .returnType<SettingsResult>()
    .with("scalar", "smartscalar", () => scalarSettings(candidate, ctx))
    .with("scatter", () => scatterSettings(candidate, ctx))
    .with("pie", () => pieSettings(candidate, ctx))
    .with("funnel", () => funnelSettings(candidate, ctx))
    .with("map", () => mapSettings(candidate, ctx))
    .with("pivot", () => pivotSettings(candidate, ctx))
    .with("table", () => tableSettings(candidate, ctx))
    .with("sankey", () => sankeySettings(candidate, ctx))
    .with("treemap", () => treemapSettings(candidate, ctx))
    .otherwise(() =>
      isCartesian(candidate.display)
        ? cartesianSettings(candidate, ctx)
        : { settings: {}, suggestedOrderBy: NO_ORDER },
    );
}

export function columnMappingNames(
  candidate: Candidate,
  profiles: ColumnProfile[],
): Partial<Record<Channel, string[]>> {
  const lookup = profileLookup(profiles);
  const entries = ALL_CHANNELS.filter(
    (channel) => candidate.mapping[channel] != null,
  ).map(
    (channel) => [channel, names(mapped(candidate, channel, lookup))] as const,
  );
  return Object.fromEntries(entries);
}
