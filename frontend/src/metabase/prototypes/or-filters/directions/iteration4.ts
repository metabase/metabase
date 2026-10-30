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
import { AxisCanvas } from "./interacting-with-axis/AxisCanvas";
import {
  DataViewCanvas as InPlaceDataViewCanvas,
  SummaryInBarDataZone as InPlaceSummaryInBarDataZone,
} from "./iteration-4-in-place/DataViewCanvas";
import {
  type ExpressionBarProps as InPlaceExpressionBarProps,
  ExpressionBar as InPlaceRowsExpressionBar,
} from "./iteration-4-in-place/ExpressionBar";
import { ExpressionBarNotebook as InPlaceExpressionBarNotebook } from "./iteration-4-in-place/ExpressionBarNotebook";
import { ExpressionBarSplitPrototype as InPlaceExpressionBarSplitPrototype } from "./iteration-4-in-place/ExpressionBarPrototype";
import { SummarizeBar as InPlaceSummarizeBar } from "./iteration-4-in-place/SummarizeBar";
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
  DataViewCanvas as AddFilter2DataViewCanvas,
  SummaryInBarDataZone as AddFilter2SummaryInBarDataZone,
} from "./iteration-4-with-add-filter-2/DataViewCanvas";
import {
  type ExpressionBarProps as AddFilter2ExpressionBarProps,
  ExpressionBar as AddFilter2RowsExpressionBar,
} from "./iteration-4-with-add-filter-2/ExpressionBar";
import { ExpressionBarNotebook as AddFilter2ExpressionBarNotebook } from "./iteration-4-with-add-filter-2/ExpressionBarNotebook";
import { ExpressionBarSplitPrototype as AddFilter2ExpressionBarSplitPrototype } from "./iteration-4-with-add-filter-2/ExpressionBarPrototype";
import { SummarizeBar as AddFilter2SummarizeBar } from "./iteration-4-with-add-filter-2/SummarizeBar";
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

/** Same bar, from the second add-filter copy of the components. */
const AddFilter2NotebookRowsBar = (props: AddFilter2ExpressionBarProps) =>
  createElement(AddFilter2RowsExpressionBar, {
    ...props,
    isInNotebook: true,
    rowsFromNesting: 2,
    hasRoundOps: true,
  });

/** Same bar, from the in-place copy of the components. */
const InPlaceNotebookRowsBar = (props: InPlaceExpressionBarProps) =>
  createElement(InPlaceRowsExpressionBar, {
    ...props,
    isInNotebook: true,
    rowsFromNesting: 2,
    hasRoundOps: true,
  });

export const ITERATION_4_DIRECTIONS: FilterDirection[] = [
  {
    id: "iteration-4-draft",
    get name() {
      return t`Darker summary pills`;
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
    hasCompactReadingOn: true,
    get name() {
      return t`Separation`;
    },
    get description() {
      return t`A copy of "Draft" with its own copy of the components, so tweaks here leave the draft alone.`;
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
    id: "iteration-4-in-place",
    hasCompactReadingOn: true,
    hasImplicitAndSetting: true,
    get name() {
      return t`Stay put, push out on OR`;
    },
    get description() {
      return t`One bar, one kind of pill. Filters on the summary (Count ≥ 3) are typed like any other column (a "Summary" group in the chooser) and stay exactly where you put them while the expression is a plain AND chain. The instant one would end up inside an "or", it glides to the end as an AND-ed conjunct, the "or" group gets its parentheses, and a note under the moved pill says why, with Undo.`;
    },
    Component: InPlaceExpressionBarSplitPrototype,
    Canvas: (props) =>
      createElement(InPlaceDataViewCanvas, {
        ...props,
        DataZone: (zoneProps) =>
          createElement(InPlaceSummaryInBarDataZone, {
            ...zoneProps,
            focusKey: FOCUS_KEY,
          }),
        hasThresholdsBesideLegend: false,
      }),
    NotebookCanvas: (props) =>
      createElement(InPlaceExpressionBarNotebook, {
        ...props,
        FilterBar: InPlaceNotebookRowsBar,
        SummarizeBar: InPlaceSummarizeBar,
        appliesOnVisualize: true,
      }),
    initialExample: REALISTIC_EXAMPLES[0],
  },
  {
    id: "iteration-4-with-add-filter",
    get name() {
      return t`With add filter`;
    },
    get description() {
      return t`A copy of "Draft" with its own copy of the components, for trying an explicit "add filter" affordance without touching the draft.`;
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
  {
    id: "iteration-4-with-add-filter-2",
    get name() {
      return t`Without AND`;
    },
    get description() {
      return t`A copy of "With add filter": the bar-click filter menu uses symbols (≤, ≥) and adds an "any operator" entry for the series; ANDs are implicit (never shown, never typed), only OR and parentheses can be added, and summary pills are the same purple as row filters.`;
    },
    Component: AddFilter2ExpressionBarSplitPrototype,
    Canvas: (props) =>
      createElement(AddFilter2DataViewCanvas, {
        ...props,
        DataZone: (zoneProps) =>
          createElement(AddFilter2SummaryInBarDataZone, {
            ...zoneProps,
            focusKey: FOCUS_KEY,
          }),
        hasThresholdsBesideLegend: false,
      }),
    NotebookCanvas: (props) =>
      createElement(AddFilter2ExpressionBarNotebook, {
        ...props,
        FilterBar: AddFilter2NotebookRowsBar,
        SummarizeBar: AddFilter2SummarizeBar,
        appliesOnVisualize: true,
      }),
    initialExample: REALISTIC_EXAMPLES[0],
  },
  {
    id: "iteration-4-interacting-with-axis",
    get name() {
      return t`Interacting with axis`;
    },
    get description() {
      return t`"Without AND", with axes that answer back. The y-axis title is the measure: replace it or compare with another. The x-axis title is the dimension: change it, regroup it, split it into series or stop. Both read as the chart draws them, with a pill border on hover; the legend is left alone. Filter, sort and top 10 sit under a line in each menu; filters land in the bar, never on the chart.`;
    },
    Component: AddFilter2ExpressionBarSplitPrototype,
    Canvas: AxisCanvas,
    NotebookCanvas: (props) =>
      createElement(AddFilter2ExpressionBarNotebook, {
        ...props,
        FilterBar: AddFilter2NotebookRowsBar,
        SummarizeBar: AddFilter2SummarizeBar,
        appliesOnVisualize: true,
      }),
    initialExample: REALISTIC_EXAMPLES[0],
  },
];
