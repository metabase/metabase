import { t } from "ttag";

import type { FilterDirection } from "../types";

import { ExpressionBarNotebook as UnifiedExpressionBarNotebook } from "./expression-bar-unified/ExpressionBarNotebook";
import {
  ExpressionBarUnifiedPrototype,
  ExpressionBarUnifiedTailPrototype,
} from "./expression-bar-unified/ExpressionBarPrototype";

/** Iteration 3: the expression bar with the stages folded into one stream. */
export const ITERATION_3_DIRECTIONS: FilterDirection[] = [
  {
    id: "expression-bar-unified",
    get name() {
      return t`Expression bar: one bar`;
    },
    get description() {
      return t`One bar, no stages. Filters on the rows and filters on the summary (Count, Sum of Total…) flow as one expression; a filter on the summary is a tinted pill with a sum icon and goes back to its own stage on apply. Autocomplete offers the summary's aggregations next to the columns, marked "after summarizing". A group that mixes the two ("Count > 50 or Category = Gizmo") is an error on the offending pill; "or" within the summary is fine. Drills land as AND-ed pills in place. Notebook mode is the full notebook with each Filter step as a plain expression bar for its own stage.`;
    },
    Component: ExpressionBarUnifiedPrototype,
    NotebookCanvas: UnifiedExpressionBarNotebook,
    canHideFilters: true,
  },
  {
    id: "expression-bar-unified-tail",
    get name() {
      return t`Expression bar: one bar, summary at the end`;
    },
    get description() {
      return t`Same as "one bar", except that a filter on the summary picked anywhere in the expression is carried to the end and AND-ed on, flashing where it lands, while the caret stays put. The summary filters always form the tail, so "or" with them is only ever typed after them. Filters read back from the query already come in that order; drills already land there.`;
    },
    Component: ExpressionBarUnifiedTailPrototype,
    NotebookCanvas: UnifiedExpressionBarNotebook,
    canHideFilters: true,
  },
];
