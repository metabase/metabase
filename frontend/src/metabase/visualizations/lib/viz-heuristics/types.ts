// The contract every visualization heuristic implements. Type-only module:
// variants may import from "./types" and "./shared" only.
import type * as Lib from "metabase-lib";
import type {
  CardDisplayType,
  DatasetColumn,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";

export type VizHeuristicId = string;

export type VizContext =
  | "metric-grid"
  | "metrics-viewer"
  | "cube"
  | "lens"
  | "harness";

/**
 * Mirrors `DimensionType` in metabase/common/metrics/utils/dimension-types
 * (parity asserted in shared.unit.spec). Duplicated because the shared
 * visualizations tier must not import the metrics-ui domain module.
 */
export type DimensionType = "time" | "geo" | "category" | "boolean" | "numeric";

export type VizDimensionType = DimensionType | "scalar";

/** What the renderer would have picked on its own. */
export interface VizHint {
  display: CardDisplayType;
  settings?: Partial<VisualizationSettings>;
}

export interface VizInput {
  cols: DatasetColumn[];
  rows?: RowValues[];
  /** May be null when only the result columns are known. */
  query: Lib.Query | null;
  dimensionType?: VizDimensionType;
  hint?: VizHint;
  /** The renderer's legal displays; a resolver must pick one of these. */
  allowed?: readonly CardDisplayType[];
  context: VizContext;
}

export interface VizDecision {
  display: CardDisplayType;
  settings?: Partial<VisualizationSettings>;
  trace?: unknown;
}

export interface VizHeuristic {
  /** Stable; stored in harness state. Kebab-case. */
  id: VizHeuristicId;
  label: string;
  description: string;
  /** Must be pure, deterministic (display + settings) and never throw. */
  resolve: (input: VizInput) => VizDecision;
}
