import { createElement } from "react";
import { t } from "ttag";

import { REALISTIC_EXAMPLES } from "../harness/realisticExamples";
import type { FilterDirection } from "../types";

import {
  DataViewCanvas,
  SummaryInBarDataZone,
} from "./chart-filters/DataViewCanvas";
import {
  type ExpressionBarProps,
  ExpressionBar as RowsExpressionBar,
} from "./expression-bar-rows/ExpressionBar";
import { SummarizeBar } from "./expression-bar-rows/SummarizeBar";
import { ExpressionBarNotebook as UnifiedExpressionBarNotebook } from "./expression-bar-unified/ExpressionBarNotebook";
import { ExpressionBarSplitPrototype } from "./expression-bar-unified/ExpressionBarPrototype";

/** Pressing this anywhere on the page puts the caret in the chill-mode bar (not the notebook's). */
const FOCUS_KEY = "f";

/** The chill-mode rows bar, flush inside a notebook Filter cell. */
const NotebookRowsBar = (props: ExpressionBarProps) =>
  createElement(RowsExpressionBar, {
    ...props,
    isInNotebook: true,
    rowsFromNesting: 2,
    hasRoundOps: true,
  });

export const ITERATION_4_DIRECTIONS: FilterDirection[] = [
  {
    id: "iteration-4-draft",
    get name() {
      return t`Iteration 4 draft`;
    },
    get description() {
      return t`"Aggregation filters from the legend" without filtering from the legend or the y-axis: the chart is just a chart. Filters on the summary (Count ≥ 3) sit in the same bar as the row filters, at its end, always AND-ed on, as pills a shade darker than the row filters. While editing, the bar only breaks into indented rows once parentheses nest two levels deep; a single level of groups stays on one line.`;
    },
    Component: ExpressionBarSplitPrototype,
    Canvas: (props) =>
      createElement(DataViewCanvas, {
        ...props,
        DataZone: (zoneProps) =>
          createElement(SummaryInBarDataZone, {
            ...zoneProps,
            focusKey: FOCUS_KEY,
          }),
        hasThresholdsBesideLegend: false,
      }),
    NotebookCanvas: (props) =>
      createElement(UnifiedExpressionBarNotebook, {
        ...props,
        FilterBar: NotebookRowsBar,
        SummarizeBar,
        appliesOnVisualize: true,
      }),
    initialExample: REALISTIC_EXAMPLES[0],
  },
];
