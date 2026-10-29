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
import {
  DataViewCanvas as SeparationDataViewCanvas,
  SummaryInBarDataZone as SeparationSummaryInBarDataZone,
} from "./iteration-4-separation/DataViewCanvas";
import {
  type ExpressionBarProps as SeparationExpressionBarProps,
  ExpressionBar as SeparationRowsExpressionBar,
} from "./iteration-4-separation/ExpressionBar";
import { ExpressionBarNotebook as SeparationExpressionBarNotebook } from "./iteration-4-separation/ExpressionBarNotebook";
import { ExpressionBarSplitPrototype as SeparationExpressionBarSplitPrototype } from "./iteration-4-separation/ExpressionBarPrototype";
import { SummarizeBar as SeparationSummarizeBar } from "./iteration-4-separation/SummarizeBar";
import {
  DataViewCanvas as AddFilterDataViewCanvas,
  SummaryInBarDataZone as AddFilterSummaryInBarDataZone,
} from "./iteration-4-with-add-filter/DataViewCanvas";
import {
  type ExpressionBarProps as AddFilterExpressionBarProps,
  ExpressionBar as AddFilterRowsExpressionBar,
} from "./iteration-4-with-add-filter/ExpressionBar";
import { ExpressionBarNotebook as AddFilterExpressionBarNotebook } from "./iteration-4-with-add-filter/ExpressionBarNotebook";
import { ExpressionBarSplitPrototype as AddFilterExpressionBarSplitPrototype } from "./iteration-4-with-add-filter/ExpressionBarPrototype";
import { SummarizeBar as AddFilterSummarizeBar } from "./iteration-4-with-add-filter/SummarizeBar";

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

/** Same bar, from the separation copy of the components. */
const SeparationNotebookRowsBar = (props: SeparationExpressionBarProps) =>
  createElement(SeparationRowsExpressionBar, {
    ...props,
    isInNotebook: true,
    rowsFromNesting: 2,
    hasRoundOps: true,
  });

/** Same bar, from the add-filter copy of the components. */
const AddFilterNotebookRowsBar = (props: AddFilterExpressionBarProps) =>
  createElement(AddFilterRowsExpressionBar, {
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
  {
    id: "iteration-4-separation",
    get name() {
      return t`Iteration 4 separation`;
    },
    get description() {
      return t`A copy of "Iteration 4 draft" with its own copy of the components, so tweaks here leave the draft alone.`;
    },
    Component: SeparationExpressionBarSplitPrototype,
    Canvas: (props) =>
      createElement(SeparationDataViewCanvas, {
        ...props,
        DataZone: (zoneProps) =>
          createElement(SeparationSummaryInBarDataZone, {
            ...zoneProps,
            focusKey: FOCUS_KEY,
          }),
        hasThresholdsBesideLegend: false,
      }),
    NotebookCanvas: (props) =>
      createElement(SeparationExpressionBarNotebook, {
        ...props,
        FilterBar: SeparationNotebookRowsBar,
        SummarizeBar: SeparationSummarizeBar,
        appliesOnVisualize: true,
      }),
    initialExample: REALISTIC_EXAMPLES[0],
  },
  {
    id: "iteration-4-with-add-filter",
    get name() {
      return t`Iteration 4 with add filter`;
    },
    get description() {
      return t`A copy of "Iteration 4 draft" with its own copy of the components, for trying an explicit "add filter" affordance without touching the draft.`;
    },
    Component: AddFilterExpressionBarSplitPrototype,
    Canvas: (props) =>
      createElement(AddFilterDataViewCanvas, {
        ...props,
        DataZone: (zoneProps) =>
          createElement(AddFilterSummaryInBarDataZone, {
            ...zoneProps,
            focusKey: FOCUS_KEY,
          }),
        hasThresholdsBesideLegend: false,
      }),
    NotebookCanvas: (props) =>
      createElement(AddFilterExpressionBarNotebook, {
        ...props,
        FilterBar: AddFilterNotebookRowsBar,
        SummarizeBar: AddFilterSummarizeBar,
        appliesOnVisualize: true,
      }),
    initialExample: REALISTIC_EXAMPLES[0],
  },
];
