import type { ComponentType } from "react";

import type * as Lib from "metabase-lib";
import type {
  CardDisplayType,
  VisualizationSettings,
} from "metabase-types/api";

/**
 * What a direction renders: the current query and display, and a way to write
 * back after an interaction. `stageIndex` is where the chart's clauses live.
 */
export type ChartCanvasProps = {
  query: Lib.Query;
  stageIndex: number;
  display: CardDisplayType;
  /** Example-provided viz settings (stacking, goals); empty after a drill changes the display. */
  settings: VisualizationSettings;
  onChange: (query: Lib.Query, display?: CardDisplayType) => void;
};

/** A canned question the canvas can load from its examples row. */
export type Example = {
  label: string;
  load: (query: Lib.Query, stageIndex: number) => Lib.Query;
  display: CardDisplayType;
  settings?: VisualizationSettings;
};

export type ChartDirection = {
  id: string;
  name: string;
  description: string;
  Component: ComponentType<ChartCanvasProps>;
  /** Loads on open; defaults to the first of `EXAMPLES`. */
  initialExample?: Example;
  /** Tucked into the group's collapsed "Other drafts" list in the rail. */
  draft?: boolean;
};
