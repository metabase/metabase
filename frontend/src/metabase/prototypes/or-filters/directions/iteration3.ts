import { t } from "ttag";

import { REALISTIC_EXAMPLES } from "../harness/realisticExamples";
import type { FilterDirection } from "../types";

import { DataViewCanvas } from "./chart-filters/DataViewCanvas";
import { DrillMenuCanvas } from "./chart-filters/DrillMenuCanvas";
import { ExpressionBarNotebook as UnifiedExpressionBarNotebook } from "./expression-bar-unified/ExpressionBarNotebook";
import {
  ExpressionBarSplitPrototype,
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
  {
    id: "expression-bar-split",
    get name() {
      return t`Expression bar: rows bar, summary pills`;
    },
    get description() {
      return t`The expression is the rows only: full "and", "or", "not" and parentheses, no summary columns in the dropdown. Filters on the summary never mix with it: they are plain AND-ed pills in a zone at the end of the bar, added through their own Σ button (aggregations only), edited by clicking, applied at once. A drill on an aggregated value lands in that zone; a draft in the expression survives it.`;
    },
    Component: ExpressionBarSplitPrototype,
    NotebookCanvas: UnifiedExpressionBarNotebook,
    canHideFilters: true,
  },
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
    id: "drill-menu",
    get name() {
      return t`Revised drill-throughs`;
    },
    get description() {
      return t`The "rows bar, summary pills" layout with the chart's click menu rebuilt. The menu says what you clicked ("Gizmo · March 2025", "Count: 523"), and every option names its value: "Only Gizmo", "Everything except Gizmo", "Only Gizmo in March 2025", "Add Widget" when a category is already picked. Never a bare = ≠ < > on a bar. The measure only offers "Only bars at 523 or more / or less", and only when there are 5+ bars. Hover an option to preview how many rows or bars it leaves. Switch "New click menu" off to compare with today's popover.`;
    },
    Component: ExpressionBarSplitPrototype,
    Canvas: DrillMenuCanvas,
    initialExample: REALISTIC_EXAMPLES[0],
  },
];
