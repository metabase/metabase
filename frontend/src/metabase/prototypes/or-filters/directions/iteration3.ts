import { createElement } from "react";
import { t } from "ttag";

import { REALISTIC_EXAMPLES } from "../harness/realisticExamples";
import type { FilterDirection } from "../types";

import { DataViewCanvas } from "./chart-filters/DataViewCanvas";
import { DrillMenuCanvas } from "./chart-filters/DrillMenuCanvas";
import { StackedCanvas } from "./chart-filters/StackedCanvas";
import { ChartHandlesCanvas } from "./chart-handles/ChartHandlesCanvas";
import { ExpressionBarDataZone } from "./expression-bar-rows/DataZone";
import { ExpressionBarNotebook as UnifiedExpressionBarNotebook } from "./expression-bar-unified/ExpressionBarNotebook";
import {
  ExpressionBarSplitPrototype,
  ExpressionBarSummaryMenuPrototype,
  ExpressionBarUnifiedPrototype,
} from "./expression-bar-unified/ExpressionBarPrototype";

/** Iteration 3: the expression bar with the stages folded into one stream. */
export const ITERATION_3_DIRECTIONS: FilterDirection[] = [
  {
    id: "data-view-zones",
    get name() {
      return t`Data and View zones`;
    },
    get description() {
      return t`Two kinds of filter, two places, two looks. "Data" on top is where the rows come from: a source chip named by Metabot (or, without it, mechanically: "Orders where …", structural "any of / all of" otherwise), with the full and/or/not expression behind it. "View" under the chart is a sentence: what is summarized, "only where" thresholds on measures (always AND-ed, numbers edited in place), sort and limit. Only measures can be thresholds: a filter on a breakout column is a row filter. Click the chart: row filters flash into Data, thresholds into View. Toggle "Metabot available" to see the fallbacks.`;
    },
    Component: ExpressionBarSplitPrototype,
    Canvas: DataViewCanvas,
    initialExample: REALISTIC_EXAMPLES[0],
  },
  {
    id: "data-view-zones-bar",
    get name() {
      return t`Data and View zones: expression bar`;
    },
    get description() {
      return t`"Data and View zones" with the Data chip replaced by the drill-through expression bar. While you edit, every parenthesized group drops onto its own indented row, like Filter rows, but you still type and switch the "and" / "or" yourself. Click away and it folds back into one line. The Metabot icon on the right of the bar opens a menu: "Generate filters" and "Summarize" (placeholders). Opening it doesn't unfold the bar.`;
    },
    Component: ExpressionBarSplitPrototype,
    Canvas: (props) =>
      createElement(DataViewCanvas, {
        ...props,
        DataZone: ExpressionBarDataZone,
      }),
    initialExample: REALISTIC_EXAMPLES[0],
  },
  {
    id: "drill-menu",
    get name() {
      return t`Revised drill-throughs`;
    },
    get description() {
      return t`The "rows bar, summary pills" layout with the chart's click menu revised. Today's drill-throughs stay on top as they are ("See these Orders", "See this month by week", "Break out by…", "Automatic insights…", "Copy value"); only the bare = ≠ < > buttons go. Under them, two short lists split by where the filter lands. "Filter" goes to the filter bar and names its value: "Only Gizmo", "Except Gizmo", "Only Gizmo in March 2025", "Add Widget" when a category is already picked. "Show if…" goes to the summary, with 5+ bars: "Count is at least 523". Hover a line for the exact condition and how many rows or bars it leaves. Switch "New click menu" off to compare with today's popover.`;
    },
    Component: ExpressionBarSplitPrototype,
    Canvas: DrillMenuCanvas,
    initialExample: REALISTIC_EXAMPLES[0],
  },
  {
    id: "expression-bar-unified",
    get name() {
      return t`Expression bar: one bar`;
    },
    get description() {
      return t`One bar, no stages. Filters on the rows and filters on the summary (Count, Sum of Total…) flow as one expression; a filter on the summary is a tinted pill with a sum icon and goes back to its own stage on apply. Autocomplete offers the summary's aggregations next to the columns, marked "after summarizing". Drills land as AND-ed pills in place. Notebook mode is the full notebook with each Filter step as a plain expression bar for its own stage. The "Mixing summary and row filters" setting picks what happens when a summary filter is picked among row filters: it stays where it was picked and a group mixing the two ("Count > 50 or Category = Gizmo") is an error on the offending pill, or it is carried to the end and AND-ed on, flashing where it lands, while the caret stays put, so the summary filters always form the tail.`;
    },
    Component: ExpressionBarUnifiedPrototype,
    NotebookCanvas: UnifiedExpressionBarNotebook,
    canHideFilters: true,
  },
  {
    id: "expression-bar-split",
    get name() {
      return t`Expression bar: separate summaries`;
    },
    get description() {
      return t`The expression is the rows only: full "and", "or", "not" and parentheses, no summary columns in the dropdown. Filters on the summary never mix with it: they are plain AND-ed pills in a zone at the end of the bar, added through their own Σ button (aggregations only), edited by clicking, applied at once. A drill on an aggregated value lands in that zone; a draft in the expression survives it.`;
    },
    Component: ExpressionBarSplitPrototype,
    NotebookCanvas: UnifiedExpressionBarNotebook,
    canHideFilters: true,
  },
  {
    id: "expression-bar-summary-menu",
    get name() {
      return t`Expression bar: summary button`;
    },
    get description() {
      return t`Like "separate summaries", but the summary's filters are folded away into a split button at the right of the bar, shown only while the query summarizes, after the query builder's Filter button. "Summary filters" adds one straight from the aggregations; the count beside it opens the existing ones as pills, one per line, editable and removable, with a button to add another. A drill on an aggregated value lands there and bumps the count.`;
    },
    Component: ExpressionBarSummaryMenuPrototype,
    NotebookCanvas: UnifiedExpressionBarNotebook,
    canHideFilters: true,
  },
  {
    id: "stacked-on-original",
    get name() {
      return t`Stacked on the original`;
    },
    get description() {
      return t`The counterpart to "Data and View zones": no stages to understand, nothing frozen. Every filter, from a bar click, the drill menu or typed, is one row expression on Orders in one bar; the summary only keeps its thresholds on measures, a short AND-only tail labelled "after summarizing". Hover a pill to see whether it applies before or after summarizing. Under the bar, each top-level AND-ed condition shows how many rows are left after conditions 1..n, so you see where rows drop off. The summary line reads the filter structurally ("any of / all of / not"); toggle "Metabot available" to swap in a name.`;
    },
    Component: ExpressionBarSplitPrototype,
    Canvas: StackedCanvas,
    initialExample: REALISTIC_EXAMPLES[0],
    draft: true,
  },
  {
    id: "chart-handles",
    get name() {
      return t`Chart handles`;
    },
    get description() {
      return t`Filters on the summary never sit in a bar: the bar above the chart is the rows only. Each threshold is a dashed line across the chart at its value, labelled "Sum of Total ≥ 50,000"; the bars it hides stay visible, faded. Drag the line up or down to move it (applied on release), hover it for the sentence and the bar count, × or Delete removes it. "Only bars at X or more / or less" in the click menu draws a new one. Switch to Table: there is no axis to draw on, so a measure's column header offers "Only rows where Sum of Total ≥ …", and the thresholds show as removable sentences above it.`;
    },
    Component: ExpressionBarSplitPrototype,
    Canvas: ChartHandlesCanvas,
    initialExample: REALISTIC_EXAMPLES[0],
    draft: true,
  },
];
