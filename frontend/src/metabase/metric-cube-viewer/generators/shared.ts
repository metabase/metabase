// Optional pure helpers for generator variants. Variants may import from
// "./types" and "./shared" only.
import type {
  CubeCard,
  CubeCardKind,
  CubeCatalog,
  CubeDimension,
  CubeDimensionKey,
  CubeMeasure,
  CubeSeries,
  DimensionType,
  MetricsViewerDisplayType,
} from "./types";

/** Mirrors DEFAULT_DISPLAY_TYPE_BY_DIMENSION (parity asserted in tests). */
export const DEFAULT_DISPLAY_BY_TYPE: Record<
  DimensionType,
  MetricsViewerDisplayType
> = {
  time: "line",
  geo: "map",
  category: "bar",
  boolean: "bar",
  numeric: "bar",
};

/** Mirrors getDimensionBreakoutConfig(type).availableDisplayTypes (parity asserted in tests). */
export const AVAILABLE_DISPLAYS_BY_TYPE: Record<
  DimensionType | "scalar",
  readonly MetricsViewerDisplayType[]
> = {
  time: ["line", "area", "bar"],
  geo: ["map", "line", "area", "bar"],
  category: ["line", "area", "bar"],
  boolean: ["line", "area", "bar"],
  numeric: ["line", "area", "bar", "scatter"],
  scalar: ["scalar"],
};

/** Deterministic id: same tuple → same id, so display overrides survive regeneration. */
export function makeCard(
  kind: CubeCardKind,
  series: CubeSeries[],
  dimensionKeys: CubeDimensionKey[],
  display: MetricsViewerDisplayType,
): CubeCard {
  const seriesKey = series
    .map((entry) =>
      [`m${entry.measureId}`, ...entry.segmentIds.map((id) => `s${id}`)].join(
        "|",
      ),
    )
    .join("+");
  return {
    id: [kind, seriesKey, ...dimensionKeys].join(":"),
    kind,
    series,
    dimensionKeys,
    display,
  };
}

export function overviewCard(measure: CubeMeasure): CubeCard {
  return makeCard(
    "overview",
    [{ measureId: measure.id, segmentIds: [] }],
    [],
    "scalar",
  );
}

/** Resolves settings ids against the catalog, dropping unknown ids, keeping settings order. */
export function resolveSettings(
  catalog: CubeCatalog,
  measureIds: CubeMeasure["id"][],
  dimensionKeys: CubeDimensionKey[],
): { measures: CubeMeasure[]; dimensions: CubeDimension[] } {
  const measureById = new Map(catalog.measures.map((m) => [m.id, m]));
  const dimensionByKey = new Map(catalog.dimensions.map((d) => [d.key, d]));
  return {
    measures: measureIds
      .map((id) => measureById.get(id))
      .filter((measure): measure is CubeMeasure => measure != null),
    dimensions: dimensionKeys
      .map((key) => dimensionByKey.get(key))
      .filter((dimension): dimension is CubeDimension => dimension != null),
  };
}

export function isLowCardinality(
  dimension: CubeDimension,
  max: number,
): boolean {
  if (dimension.type === "boolean") {
    return true;
  }
  return (
    dimension.type === "category" &&
    dimension.distinctCount != null &&
    dimension.distinctCount >= 2 &&
    dimension.distinctCount <= max
  );
}

/** Deterministic Fisher–Yates shuffle (mulberry32). */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const random = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
