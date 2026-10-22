import { type ReactNode, createContext } from "react";

import type * as Lib from "metabase-lib";

export interface FilterPreviewProps {
  query: Lib.Query;
  stageIndex: number;
  /** The filter that the picker updates, or undefined for a new filter. */
  filter?: Lib.Filterable;
  /** The filter that the picker would apply now, or undefined when its state is not valid yet. */
  draftFilter?: Lib.ExpressionClause;
}

export interface FilterPreviewContextValue {
  renderPreview: (props: FilterPreviewProps) => ReactNode;
  /** Shown at the left of the picker footer, next to the submit button. */
  renderFooterLabel?: (props: FilterPreviewProps) => ReactNode;
}

/**
 * Prototype: when a provider is present, filter pickers show a live preview of
 * the filter next to their controls.
 */
export const FilterPreviewContext =
  createContext<FilterPreviewContextValue | null>(null);

/** The footer label from [[FilterPreviewContextValue]] for the current picker. */
export const FilterFooterLabelContext = createContext<ReactNode>(null);

export type TypedValuesApplyMode = "pause" | "blur";

export interface FilterAutoApplyContextValue {
  /** Whether filter changes on this query apply to the question at once. */
  isEnabled: (query: Lib.Query) => boolean;
  /**
   * Puts the draft filter into the query of the question and runs it. Does
   * nothing when the question already has this query.
   */
  apply: (props: FilterPreviewProps) => void;
  typedValuesApplyMode: TypedValuesApplyMode;
  typingPauseMs: number;
}

/**
 * Prototype: when a provider is present and enabled for the query, filter
 * pickers apply the filter as the user changes it, and have no Apply button.
 */
export const FilterAutoApplyContext =
  createContext<FilterAutoApplyContextValue | null>(null);
