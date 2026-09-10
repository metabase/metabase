// Viewer-level state types. Serializable: ids only, no LibMetric objects.
import type {
  DimensionFilterValue,
  MetricsViewerDisplayType,
} from "metabase/common/metrics-viewer";
import type { SegmentId } from "metabase-types/api";

import type {
  CardGeneratorId,
  CubeCard,
  CubeCoarseSettings,
  CubeDimensionKey,
} from "./generators/types";

export type {
  CardGenerator,
  CardGeneratorId,
  CubeCard,
  CubeCardKind,
  CubeCatalog,
  CubeCoarseSettings,
  CubeDimension,
  CubeDimensionKey,
  CubeMeasure,
  CubeSegment,
  CubeSeries,
} from "./generators/types";

export type CubeViewerMode = "coarse" | "fine";

export interface CubeDimensionFilter {
  dimensionKey: CubeDimensionKey;
  value: DimensionFilterValue;
}

export interface CubeFilters {
  /** AND-ed on top of every series' own segments. */
  segmentIds: SegmentId[];
  dimensionFilters: CubeDimensionFilter[];
}

export interface CubeViewerState {
  generatorId: CardGeneratorId;
  mode: CubeViewerMode;
  /** Authoritative in coarse mode; frozen snapshot in fine mode. */
  settings: CubeCoarseSettings;
  /** Always materialized: generated + overrides (coarse) or edited (fine). */
  cards: CubeCard[];
  /** Coarse mode only. Keyed by generated card id. Cleared when entering fine mode. */
  displayOverrides: Record<string, MetricsViewerDisplayType>;
  filters: CubeFilters;
}
