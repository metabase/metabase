import type { PrototypeDefinition } from "../types";

import { BaselinePrototype } from "./baseline/BaselinePrototype";
import { DimensionMappingPrototype } from "./dimension_mapping/DimensionMappingPrototype";
import { ImprovedDimensionsPrototype } from "./dimensions/ImprovedDimensionsPrototype";
import {
  MetricEditorBlocksPrototype,
  MetricEditorPrototype,
} from "./explorer/MetricEditorPrototype";
import { MetricExplorerPrototype } from "./explorer/MetricExplorerPrototype";
import { MetricEditorPrototype as MetricEditorPrototypeV2 } from "./explorer_v2/MetricEditorPrototype";
import {
  PillFiltersPrototype,
  SegmentsPrototype,
} from "./explorer_v3/MetricEditorPrototype";
import { InvestigationModePrototype } from "./investigation/InvestigationModePrototype";
import { MetricDependencyTreePrototype } from "./tree/MetricDependencyTreePrototype";
import { MetricTreeHiFiPrototype } from "./tree/MetricTreeHiFiPrototype";
import { MetricTreePrototype } from "./tree/MetricTreePrototype";
import { MetricsMapPrototype } from "./tree/MetricsMapPrototype";
import { MetricsMapV2Prototype } from "./tree/MetricsMapV2Prototype";

export const METRICS_PROTOTYPES: PrototypeDefinition[] = [
  {
    id: "baseline",
    name: "Baseline",
    description: "Metric pages as they are in Data Studio today.",
    Component: BaselinePrototype,
  },
  {
    id: "metric-editor",
    name: "Definition with expression bar",
    description:
      "A metric's Definition tab is the Metric Explorer: its bar is the definition, math over measures with filters per measure and on the whole metric. Edit it and save. New metric opens the same page, empty.",
    group: "Iteration 1",
    Component: MetricEditorPrototype,
  },
  {
    id: "metric-editor-blocks",
    name: "Definition with blocks",
    description:
      "The definition is built from large blocks, one per measure or metric: pick operators between them, and each measure's filters show as rows in its block.",
    group: "Iteration 1",
    Component: MetricEditorBlocksPrototype,
  },
  {
    id: "metric-explorer",
    name: "Metric Explorer as Definition",
    description:
      "The Definition tab shows the metric in the Metric Explorer. Defining one, new or existing, happens in a large modal: math over measures, each with its own filters.",
    group: "Iteration 1",
    draft: true,
    Component: MetricExplorerPrototype,
  },
  {
    id: "metric-tree",
    name: "Metric Tree (lo-fi)",
    description:
      "How a metric breaks down into metrics and measures, with live values, to verify it and navigate to what drives it.",
    group: "Iteration 1",
    draft: true,
    Component: MetricTreePrototype,
  },
  {
    id: "metric-tree-hifi",
    name: "Dependencies tab",
    description:
      "On a metric's Dependencies tab: how it breaks down into measures, with values and trends, in the schema viewer's visual language. Click a card for details.",
    group: "Iteration 1",
    Component: MetricTreeHiFiPrototype,
  },
  {
    id: "metrics-map",
    name: "Metrics map",
    description:
      "Every metric on one top-down canvas, each above the metrics and measures it's built from, like a company KPI tree. Select a card to light up what drives it and what it drives.",
    group: "Iteration 1",
    Component: MetricsMapPrototype,
  },
  {
    id: "metric-dependency-tree",
    name: "Metric Tree (to columns)",
    description:
      "On a metric's Dependencies tab, in the schema viewer's visual language: each term of the metric points to its measure, and each measure's aggregation, filters and time dimension point to the columns they read.",
    group: "Iteration 1",
    draft: true,
    Component: MetricDependencyTreePrototype,
  },
  {
    id: "improved-dimensions",
    name: "Improved Dimensions tab",
    description:
      "Dimensions in and not in the metric, in two sections on the left. Move them with the arrows, by dragging, or in bulk by checking several. A dimension is always selected, so its settings always fill the right.",
    group: "Iteration 1",
    Component: ImprovedDimensionsPrototype,
  },
  {
    id: "investigation-mode",
    name: "Investigation mode",
    description:
      "The Dependencies tab as a left-to-right walk from the metric into its parts, to find which branch caused a change. Select a node to break it out by its dimensions and segments; anything beyond the walk opens in the Metric Explorer.",
    group: "Iteration 2",
    Component: InvestigationModePrototype,
  },
  {
    id: "metrics-map-v2",
    name: "Metrics map v2",
    description:
      "The metrics map top-down, one metric at a time: pick the top metric and click cards to open what each is built from.",
    group: "Iteration 2",
    Component: MetricsMapV2Prototype,
  },
  {
    id: "dimension-mapping",
    name: "Dimension mapping",
    description:
      "Revenue per active user, over two unrelated tables: pick which column of each term every dimension reads, with the Metric Explorer's per-term selects, and which dimensions the metric publishes.",
    group: "Iteration 2",
    Component: DimensionMappingPrototype,
  },
  {
    id: "segments",
    name: "Segments",
    description:
      "A pill is filtered only by named segments, picked from its table or created on the spot, so the definition reads left to right.",
    group: "Iteration 2",
    Component: SegmentsPrototype,
  },
  {
    id: "pill-filters-panel",
    name: "Pill filters below the bar",
    description:
      "Select a pill and the panel below the bar shows its segments; the pill only shows a filter icon with a count. With nothing selected, the panel filters the whole metric.",
    group: "Iteration 2",
    Component: PillFiltersPrototype,
  },
  // Last, so /prototypes opens it.
  {
    id: "metric-editor-v2",
    name: "Filters by dimension",
    description:
      "Filters follow dimensions. A pill is filtered by its own dimensions, the whole metric by the ones every pill has, mapped in the Dimensions tab. A metric that is math over measures can be a pill. Try the last three examples.",
    group: "Iteration 2",
    Component: MetricEditorPrototypeV2,
  },
];
