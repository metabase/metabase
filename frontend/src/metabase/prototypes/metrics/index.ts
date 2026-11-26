import type { PrototypeDefinition } from "../types";

import { BaselinePrototype } from "./baseline/BaselinePrototype";
import { ImprovedDimensionsPrototype } from "./dimensions/ImprovedDimensionsPrototype";
import {
  MetricEditorBlocksPrototype,
  MetricEditorPrototype,
} from "./explorer/MetricEditorPrototype";
import { MetricExplorerPrototype } from "./explorer/MetricExplorerPrototype";
import { MetricDependencyTreePrototype } from "./tree/MetricDependencyTreePrototype";
import { MetricTreeHiFiPrototype } from "./tree/MetricTreeHiFiPrototype";
import { MetricTreePrototype } from "./tree/MetricTreePrototype";
import { MetricsMapPrototype } from "./tree/MetricsMapPrototype";

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
];
