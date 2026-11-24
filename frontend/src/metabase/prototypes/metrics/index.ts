import type { PrototypeDefinition } from "../types";

import { BaselinePrototype } from "./baseline/BaselinePrototype";
import { MetricEditorPrototype } from "./explorer/MetricEditorPrototype";
import { MetricExplorerPrototype } from "./explorer/MetricExplorerPrototype";
import { MetricTreePrototype } from "./tree/MetricTreePrototype";

export const METRICS_PROTOTYPES: PrototypeDefinition[] = [
  {
    id: "baseline",
    name: "Baseline",
    description: "Metric pages as they are in Data Studio today.",
    Component: BaselinePrototype,
  },
  {
    id: "metric-editor",
    name: "Metric Explorer as editor",
    description:
      "A metric's Definition tab is the Metric Explorer: its bar is the definition, math over measures with filters per measure and on the whole metric. Edit it and save. New metric opens the same page, empty.",
    group: "Iteration 1",
    Component: MetricEditorPrototype,
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
    name: "Metric Tree",
    description:
      "How a metric breaks down into metrics and measures, with live values, to verify it and navigate to what drives it.",
    group: "Iteration 1",
    Component: MetricTreePrototype,
  },
];
