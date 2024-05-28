import { t } from "ttag";

import { GRAPH_GOAL_SETTINGS } from "metabase/visualizations/lib/settings/goal";
import { getDefaultDimensionLabel } from "metabase/visualizations/lib/settings/graph";

export const ROW_CHART_SETTINGS = {
  "stackable.stack_type": {
    section: t`Display`,
    title: t`Stacking`,
    index: 1,
    widget: "radio",
    default: null,
    props: {
      options: [
        { name: t`Don't stack`, value: null },
        { name: t`Stack`, value: "stacked" },
        { name: t`Stack - 100%`, value: "normalized" },
      ],
    },
  },
  ...GRAPH_GOAL_SETTINGS,
  "graph.x_axis.scale": {
    section: t`Axes`,
    group: t`Y-axis`,
    title: t`Scale`,
    index: 4,
    widget: "select",
    default: "ordinal",
    getProps: () => {
      return { options: [{ name: t`Ordinal`, value: "ordinal" }] };
    },
  },
  "graph.y_axis.scale": {
    section: t`Axes`,
    title: t`Scale`,
    index: 7,
    group: t`X-axis`,
    widget: "select",
    default: "linear",
    getProps: () => ({
      options: [
        { name: t`Linear`, value: "linear" },
        { name: t`Power`, value: "pow" },
        { name: t`Log`, value: "log" },
      ],
    }),
  },
  "graph.x_axis.axis_enabled": {
    section: t`Axes`,
    group: t`Y-axis`,
    title: t`Show lines and marks`,
    index: 3,
    widget: "select",
    props: {
      options: [
        { name: t`Hide`, value: false },
        { name: t`Show`, value: true },
      ],
    },
    default: true,
  },
  "graph.y_axis.axis_enabled": {
    section: t`Axes`,
    title: t`Show lines and marks`,
    index: 8,
    group: t`X-axis`,
    widget: "select",
    props: {
      options: [
        { name: t`Hide`, value: false },
        { name: t`Show`, value: true },
      ],
    },
    default: true,
  },
  "graph.y_axis.auto_range": {
    section: t`Axes`,
    group: t`X-axis`,
    index: 4,
    title: t`Auto x-axis range`,
    inline: true,
    widget: "toggle",
    default: true,
  },
  "graph.y_axis.min": {
    section: t`Axes`,
    group: t`X-axis`,
    index: 5,
    title: t`Min`,
    widget: "number",
    default: 0,
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.y_axis.auto_range"] !== false,
  },
  "graph.y_axis.max": {
    section: t`Axes`,
    group: t`X-axis`,
    index: 6,
    title: t`Max`,
    widget: "number",
    default: 100,
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.y_axis.auto_range"] !== false,
  },
  "graph.x_axis.labels_enabled": {
    section: t`Axes`,
    group: t`Y-axis`,
    index: 1,
    title: t`Show label`,
    inline: true,
    widget: "toggle",
    default: true,
  },
  "graph.x_axis.title_text": {
    section: t`Axes`,
    title: t`Label`,
    index: 2,
    group: t`Y-axis`,
    widget: "input",
    getHidden: (series, vizSettings) =>
      vizSettings["graph.x_axis.labels_enabled"] === false,
    getDefault: getDefaultDimensionLabel,
    getProps: series => ({
      placeholder: getDefaultDimensionLabel(series),
    }),
  },
  "graph.y_axis.labels_enabled": {
    section: t`Axes`,
    title: t`Show label`,
    index: 1,
    group: t`X-axis`,
    widget: "toggle",
    inline: true,
    default: true,
  },
  "graph.y_axis.title_text": {
    section: t`Axes`,
    title: t`Label`,
    index: 2,
    group: t`X-axis`,
    widget: "input",
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.y_axis.labels_enabled"] === false,
    getDefault: (series, vizSettings) => {
      // If there are multiple series, we check if the metric names match.
      // If they do, we use that as the default y axis label.
      const [metric] = vizSettings["graph.metrics"];
      const metricNames = Array.from(
        new Set(
          series.map(({ data: { cols } }) => {
            const metricCol = cols.find(c => c.name === metric);
            return metricCol && metricCol.display_name;
          }),
        ),
      );
      return metricNames.length === 1 ? metricNames[0] : null;
    },
    readDependencies: ["series", "graph.metrics"],
  },
  "graph.show_values": {
    section: t`Display`,
    title: t`Show values on data points`,
    widget: "toggle",
    inline: true,
    getHidden: (_series, vizSettings) =>
      vizSettings["stackable.stack_type"] === "normalized",
    default: false,
  },
  "graph.label_value_formatting": {
    section: t`Display`,
    title: t`Value labels formatting`,
    widget: "segmentedControl",
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.show_values"] !== true ||
      vizSettings["stackable.stack_type"] === "normalized",
    props: {
      options: [
        { name: t`Compact`, value: "compact" },
        { name: t`Full`, value: "full" },
      ],
    },
    default: "full",
    readDependencies: ["graph.show_values"],
  },
};
