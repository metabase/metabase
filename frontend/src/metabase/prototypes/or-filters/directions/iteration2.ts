import { t } from "ttag";

import type { FilterDirection } from "../types";

import { ExpressionBarInline2Prototype } from "./expression-bar-2/ExpressionBarPrototype";
import {
  QuestionView,
  withSumOfTotalByMonth,
} from "./expression-bar-drill/QuestionView";

/**
 * Iteration 2 directions: the next round, built on what iteration 1 taught us. Iteration 1
 * stays in `./index.ts` untouched so both rounds remain clickable side by side.
 */
export const ITERATION_2_DIRECTIONS: FilterDirection[] = [
  {
    id: "expression-bar-inline-2",
    get name() {
      return t`Expression bar: inline stages`;
    },
    get description() {
      return t`One bar for the whole expression. Pick filters from a dropdown; type "and", "or" and parentheses between them. Once the query has a summary, a second numbered stage follows inline for filters on the summary (Count, breakout columns), on its own band; the boundary between stages is an AND that can't be changed. Arrow keys cross between stages. Cancel and Apply sit in the bar; the header button hides and shows the strip.`;
    },
    Component: ExpressionBarInline2Prototype,
    canHideFilters: true,
  },
  {
    id: "expression-bar-drill",
    get name() {
      return t`Expression bar with drill-through`;
    },
    get description() {
      return t`Expression bar with inline stages in a real question: Orders, Sum of Total by month. Type in the bar itself: the app's filter list opens under the caret with a "Logic" section (and, or, parentheses) on top, and the best match is highlighted as you type. A filter only becomes a pill once its column is picked. Click a point on the chart and use "See these orders" or "Break out by…": the drill's filters are appended at the end, AND-ed with what's there, wrapped in parentheses when the existing expression is an OR.`;
    },
    Component: ExpressionBarInline2Prototype,
    Canvas: QuestionView,
    prepareQuery: withSumOfTotalByMonth,
  },
];
