import { createElement } from "react";
import { t } from "ttag";

import type { FilterDirection } from "../types";

import { ExpressionBarInline2Prototype } from "./expression-bar-2/ExpressionBarPrototype";
import {
  QuestionView,
  withSumOfTotalByMonth,
} from "./expression-bar-drill/QuestionView";
import { SelectSummarizeBar } from "./expression-bar-summarize/ExpressionBar";
import { withFiltersForMetabot } from "./expression-bar-summarize/summaries";

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
  {
    id: "expression-bar-summarize-selection",
    get name() {
      return t`Expression-bar: LLM summaries and generation`;
    },
    get description() {
      return t`The drill-through bar with six filters on the product and customer. Drag across filters like selecting text: a floating Metabot "Summarize" button turns the selection into one pill with a short generated phrase (canned for the prototype). Try the three product filters, or the two customer ones. Click a summary to lay its filters back out in the bar; clicking outside the bar or Apply folds them back, unless you edited them, in which case they stay as plain filters. The Metabot icon on the right opens "Tell Metabot how you want to filter": click the text box to get a canned prompt, ("only orders over $50 that were either discounted or had 3 or more items") and the generated filters land in the bar as normal pills, ready to be selected and summarized.`;
    },
    Component: ExpressionBarInline2Prototype,
    Canvas: (props) =>
      createElement(QuestionView, { ...props, Bar: SelectSummarizeBar }),
    prepareQuery: withFiltersForMetabot,
  },
];
