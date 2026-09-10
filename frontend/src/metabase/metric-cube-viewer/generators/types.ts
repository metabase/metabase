// The contract every card generator implements. Type-only module: variants may
// import from "./types" and "./shared" only.
import type { DimensionType } from "metabase/common/metrics/utils/dimension-types";
import type { MetricsViewerDisplayType } from "metabase/common/metrics-viewer";
import type {
  ConcreteTableId,
  DimensionId,
  MeasureId,
  SegmentId,
} from "metabase-types/api";

export type { DimensionType, MetricsViewerDisplayType };

// ── Catalog: everything a generator may know about the table ──

/** Stable across measures on the same table: `field:<fieldId>`. */
export type CubeDimensionKey = string;

export interface CubeMeasure {
  id: MeasureId;
  name: string;
  /** Aggregation operator is count / sum / cum-count / cum-sum. */
  isAdditive: boolean;
  /** This measure's own DimensionId for each cube dimension it supports. */
  dimensionIds: Partial<Record<CubeDimensionKey, DimensionId>>;
}

export interface CubeDimension {
  key: CubeDimensionKey;
  label: string;
  type: DimensionType;
  /** 0..1 — field `dimension_interestingness`, or the catalog's fallback. */
  score: number;
  /** Fingerprint distinct count, when known. */
  distinctCount: number | null;
  canListValues: boolean;
}

export interface CubeSegment {
  id: SegmentId;
  name: string;
}

export interface CubeCatalog {
  tableId: ConcreteTableId;
  /** Sorted by name. */
  measures: CubeMeasure[];
  /** Sorted by label. */
  dimensions: CubeDimension[];
  /** Sorted by name. */
  segments: CubeSegment[];
}

// ── Settings and cards: serializable, ids only ──

export interface CubeCoarseSettings {
  measureIds: MeasureId[];
  dimensionKeys: CubeDimensionKey[];
  filterDimensionKeys: CubeDimensionKey[];
}

export interface CubeSeries {
  measureId: MeasureId;
  /** AND-ed. v1 UI sets at most one. */
  segmentIds: SegmentId[];
}

export type CubeCardKind =
  | "overview"
  | "single"
  | "time-by-category"
  | "by-segment"
  | "segment-vs-total"
  | "segmented-single"
  | "custom";

export interface CubeCard {
  /** Deterministic for generated cards (see `makeCard`); uuid for custom cards. */
  id: string;
  kind: CubeCardKind;
  series: CubeSeries[];
  /** [] = no dimension; [x]; [x, seriesBreakout]. */
  dimensionKeys: CubeDimensionKey[];
  display: MetricsViewerDisplayType;
}

// ── The generator contract ──

export type CardGeneratorId = string;

export interface CardGenerator {
  /** Stable; stored in viewer state (and later in saved views). Kebab-case. */
  id: CardGeneratorId;
  /** Developer-facing. */
  name: string;
  description: string;
  /** Initial coarse settings for a table. */
  getDefaultSettings: (catalog: CubeCatalog) => CubeCoarseSettings;
  /**
   * Cards for the given settings, in display order. Used for initial load
   * (with `getDefaultSettings`) and for every coarse refinement.
   * Must be pure and deterministic.
   */
  generateCards: (
    catalog: CubeCatalog,
    settings: CubeCoarseSettings,
  ) => CubeCard[];
}
