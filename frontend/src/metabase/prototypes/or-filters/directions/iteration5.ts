import { createElement } from "react";
import { t } from "ttag";

import { REALISTIC_EXAMPLES } from "../harness/realisticExamples";
import type { FilterCanvasProps, FilterDirection } from "../types";

import {
  DataViewCanvas,
  SummaryInBarDataZone,
} from "./iteration-5-draft/DataViewCanvas";
import {
  type ExpressionBarProps,
  ExpressionBar as RowsExpressionBar,
} from "./iteration-5-draft/ExpressionBar";
import { ExpressionBarNotebook } from "./iteration-5-draft/ExpressionBarNotebook";
import { ExpressionBarSplitPrototype } from "./iteration-5-draft/ExpressionBarPrototype";
import { SummarizeBar } from "./iteration-5-draft/SummarizeBar";

/** Pressing this anywhere on the page puts the caret in the chill-mode bar (not the notebook's). */
const FOCUS_KEY = "f";

/** Defined once: a new component type on every render would remount the bars and drop the caret. */
const DraftDataZone = (props: FilterCanvasProps) =>
  createElement(SummaryInBarDataZone, { ...props, focusKey: FOCUS_KEY });

/** The chill-mode rows bar, flush inside a notebook Filter cell. */
const NotebookRowsBar = (props: ExpressionBarProps) =>
  createElement(RowsExpressionBar, {
    ...props,
    isInNotebook: true,
    rowsFromNesting: 2,
    hasRoundOps: true,
  });

export const ITERATION_5_DIRECTIONS: FilterDirection[] = [
  {
    id: "iteration-5-draft",
    get name() {
      return t`Draft`;
    },
    get description() {
      return t`A copy of "Without AND": a dash splits the filters on rows from the filters on the summary, the filter popover looks like the app's, and a summary filter that would land inside an "or" can't be picked there.`;
    },
    Component: ExpressionBarSplitPrototype,
    Canvas: (props) =>
      createElement(DataViewCanvas, {
        ...props,
        DataZone: DraftDataZone,
        hasThresholdsBesideLegend: false,
      }),
    NotebookCanvas: (props) =>
      createElement(ExpressionBarNotebook, {
        ...props,
        FilterBar: NotebookRowsBar,
        SummarizeBar,
        appliesOnVisualize: true,
      }),
    initialExample: REALISTIC_EXAMPLES[0],
  },
];
