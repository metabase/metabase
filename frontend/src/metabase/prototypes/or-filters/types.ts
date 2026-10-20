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

export type FilterDirection = {
  id: string;
  name: string;
  description: string;
  Component: ComponentType<FilterUiProps>;
  /** Replaces the chill header's static "Filter" button. */
  FilterButton?: ComponentType<FilterUiProps>;
  /** The chill header's button reads "Hide filters" and toggles the strip. */
  canHideFilters?: boolean;
};
