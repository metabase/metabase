import type { ComponentType } from "react";

import type * as Lib from "metabase-lib";

export type FilterUiVariant = "chill" | "notebook";

/**
 * The contract the real filter UIs share (FilterPanel, FilterStep): read the
 * stage's filters from `query`, write back a whole new query.
 */
export type FilterUiProps = {
  query: Lib.Query;
  stageIndex: number;
  variant: FilterUiVariant;
  onChange: (query: Lib.Query) => void;
};

/** A direction that brings its own view instead of the chill/notebook frames. */
export type FilterCanvasProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
};

export type FilterDirection = {
  id: string;
  name: string;
  description: string;
  Component: ComponentType<FilterUiProps>;
  /** Replaces the chill header's static "Filter" button. */
  FilterButton?: ComponentType<FilterUiProps>;
  /** The chill header's button reads "Hide filters" and toggles the strip. */
  canHideFilters?: boolean;
  /** Replaces the chill and notebook frames with the direction's own view. */
  Canvas?: ComponentType<FilterCanvasProps>;
  /** Replaces only the notebook frame, keeping the chill mode. */
  NotebookCanvas?: ComponentType<FilterCanvasProps>;
  /** Turns the plain Orders query into the direction's starting query. */
  prepareQuery?: (query: Lib.Query) => Lib.Query;
};
