import type { ComponentType } from "react";

import type * as Lib from "metabase-lib";
import type { CardDisplayType } from "metabase-types/api";

import type { QuestionHeading } from "./harness/heading";

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
  /** The header's title; defaults to the query's generated name. */
  heading?: QuestionHeading;
  /** How the loaded example asked to render; chart canvases default to a bar. */
  display?: CardDisplayType;
};

/** A canned query the harness can load from its examples row. */
export type Example = {
  label: string;
  /** The name it would be saved under; the question's title while it is unchanged. */
  title?: string;
  load: (query: Lib.Query, stageIndex: number) => Lib.Query;
  /** How the results render once loaded; defaults to a table. */
  display?: CardDisplayType;
  /** What to click in the results and what the drill writes; shown as a tooltip. */
  hint?: string;
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
  /** Loads on open instead of the plain Orders query. */
  initialExample?: Example;
  /** Tucked into the iteration's collapsed "Other drafts" group in the rail. */
  draft?: boolean;
};
