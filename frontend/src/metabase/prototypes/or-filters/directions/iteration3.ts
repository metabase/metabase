import { t } from "ttag";

import type { FilterDirection } from "../types";

import { ExpressionBarNotebook } from "./expression-bar-3/ExpressionBarNotebook";
import { ExpressionBarInline3Prototype } from "./expression-bar-3/ExpressionBarPrototype";

/** Iteration 3 starts from a separate copy of the inline-stages direction. */
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
];
