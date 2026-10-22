import { createContext } from "react";

import type * as Lib from "metabase-lib";

export interface DraftFilterProps {
  query: Lib.Query;
  stageIndex: number;
  /** The filter that the picker updates, or undefined for a new filter. */
  filter?: Lib.Filterable;
  /** The filter that the picker would apply now, or undefined when its state is not valid yet. */
  draftFilter?: Lib.ExpressionClause;
}

export type TypedValuesApplyMode = "pause" | "blur";

export interface FilterAutoApplyContextValue {
  /** Whether filter changes on this query apply to the question at once. */
  isEnabled: (query: Lib.Query) => boolean;
  /**
   * Puts the draft filter into the query of the question and runs it. Does
   * nothing when the question already has this query.
   */
  apply: (props: DraftFilterProps) => void;
  typedValuesApplyMode: TypedValuesApplyMode;
  typingPauseMs: number;
}

/**
 * Prototype: when a provider is present and enabled for the query, filter
 * pickers apply the filter as the user changes it, and have no Apply button.
 */
export const FilterAutoApplyContext =
  createContext<FilterAutoApplyContextValue | null>(null);
