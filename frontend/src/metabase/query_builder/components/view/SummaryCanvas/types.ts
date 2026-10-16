import type * as Lib from "metabase-lib";
import type { CardDisplayType, CardId, Dashboard } from "metabase-types/api";

export const SUMMARY_WELL_IDS = ["rows", "columns", "values"] as const;

export type SummaryWellId = (typeof SUMMARY_WELL_IDS)[number];

export type SummaryDimensionWellId = Exclude<SummaryWellId, "values">;

export type SummaryDimension = {
  id: string;
  column: Lib.ColumnMetadata;
  /** The temporal unit's short name, such as `month`; `null` uses the column's default. */
  temporalUnit: string | null;
};

/** One calculated value, stored as formula text so it recompiles against the latest source. */
export type SummaryValue = {
  id: string;
  source: string;
};

/** Grid position in dashboard units: 24 columns wide. */
export type SummaryBlockLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SummaryBlock = {
  id: string;
  /** A user-provided title; `null` derives one from the values and groupings. */
  title: string | null;
  rows: SummaryDimension[];
  columns: SummaryDimension[];
  values: SummaryValue[];
  /** Filters that apply to this block only, on top of the data tab's filters. */
  filters: Lib.FilterClause[];
  /** A chosen visualization; `null` picks one from the block's shape. */
  display: CardDisplayType | null;
  layout: SummaryBlockLayout;
  /** The card this block was saved as, once the canvas is saved to a dashboard. */
  cardId: CardId | null;
};

/** The dashboard a canvas was saved to; later saves update it. */
export type SummaryCanvasDashboard = Pick<
  Dashboard,
  "id" | "name" | "collection_id"
>;

export type SummaryCanvasState = {
  blocks: SummaryBlock[];
  selectedBlockId: string | null;
  dashboard: SummaryCanvasDashboard | null;
  /** Saved cards of blocks removed since the last save, to take off the dashboard next time. */
  removedCardIds: CardId[];
};

/** The query every block builds on: the data tab's query, minus raw-row presentation clauses. */
export type SummaryBase = {
  query: Lib.Query;
  stageIndex: number;
};

export type SummaryDragItem =
  | { kind: "column"; column: Lib.ColumnMetadata; label: string }
  | {
      kind: "metric";
      metric: Lib.MetricMetadata | Lib.MeasureMetadata;
      label: string;
    }
  | { kind: "chip"; wellId: SummaryWellId; itemId: string; label: string };

/**
 * Where a dragged field can land: a well of the selected block, an existing block
 * (to group it or add a value), or empty canvas (for a new block).
 */
export type SummaryDropTarget =
  | { type: "well"; wellId: SummaryWellId }
  | { type: "block"; blockId: string }
  | { type: "canvas" };
