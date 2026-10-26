import { t } from "ttag";

import type { FilterDirection } from "../types";

import { ExpressionBarNotebook } from "./expression-bar-3/ExpressionBarNotebook";
import { ExpressionBarInline3Prototype } from "./expression-bar-3/ExpressionBarPrototype";
import { ExpressionBarNotebook as UnifiedExpressionBarNotebook } from "./expression-bar-unified/ExpressionBarNotebook";
import { ExpressionBarUnifiedPrototype } from "./expression-bar-unified/ExpressionBarPrototype";

/** Iteration 3: the inline-stages copy, and the same bar with the stages folded into one stream. */
export const ITERATION_3_DIRECTIONS: FilterDirection[] = [
  {
    id: "expression-bar-inline-3",
    get name() {
      return t`Expression bar: inline stages`;
    },
    get description() {
      return t`One bar for the whole expression. Pick filters from a dropdown; type "and", "or" and parentheses between them. Once the query has a summary, a second numbered stage follows inline for filters on the summary (Count, breakout columns), on its own band; the boundary between stages is an AND that can't be changed. Arrow keys cross between stages. Cancel and Apply sit in the bar; the header button hides and shows the strip. Notebook mode is the full notebook with each Filter step as an expression bar for its own stage.`;
    },
    Component: ExpressionBarInline3Prototype,
    NotebookCanvas: ExpressionBarNotebook,
    canHideFilters: true,
  },
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
];
