import { t } from "ttag";

import { GRAPH_GOAL_SETTINGS } from "metabase/visualizations/lib/settings/goal";
import { getDefaultDimensionLabel } from "metabase/visualizations/lib/settings/graph";

export const ROW_CHART_SETTINGS = {
  "stackable.stack_type": {
    get section() {
      return t`Display`;
    },
    get title() {
      return t`Stacking`;
    },
    index: 1,
    widget: "radio",
    default: null,
    props: {
      options: [
        {
          get name() {
            return t`Don't stack`;
          },
          value: null,
        },
        {
          get name() {
            return t`Stack`;
          },
          value: "stacked",
        },
        {
          get name() {
            return t`Stack - 100%`;
          },
          value: "normalized",
        },
      ],
    },
  },
  ...GRAPH_GOAL_SETTINGS,
  "graph.x_axis.scale": {
    get section() {
      return t`Axes`;
    },
    get group() {
      return t`Y-axis`;
    },
    get title() {
      return t`Scale`;
    },
    index: 4,
    widget: "select",
    default: "ordinal",
    getProps: () => {
      return { options: [{ name: t`Ordinal`, value: "ordinal" }] };
    },
  },
  "graph.y_axis.scale": {
    get section() {
      return t`Axes`;
    },
    get title() {
      return t`Scale`;
    },
    index: 7,
    get group() {
      return t`X-axis`;
    },
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
    get section() {
      return t`Axes`;
    },
    get group() {
      return t`Y-axis`;
    },
    get title() {
      return t`Show lines and marks`;
    },
    index: 3,
    widget: "select",
    props: {
      options: [
        {
          get name() {
            return t`Hide`;
          },
          value: false,
        },
        {
          get name() {
            return t`Show`;
          },
          value: true,
        },
      ],
    },
    default: true,
  },
  "graph.y_axis.axis_enabled": {
    get section() {
      return t`Axes`;
    },
    get title() {
      return t`Show lines and marks`;
    },
    index: 8,
    get group() {
      return t`X-axis`;
    },
    widget: "select",
    props: {
      options: [
        {
          get name() {
            return t`Hide`;
          },
          value: false,
        },
        {
          get name() {
            return t`Show`;
          },
          value: true,
        },
      ],
    },
    default: true,
  },
  "graph.y_axis.auto_range": {
    get section() {
      return t`Axes`;
    },
    get group() {
      return t`X-axis`;
    },
    index: 4,
    get title() {
      return t`Auto x-axis range`;
    },
    inline: true,
    widget: "toggle",
    default: true,
  },
  "graph.y_axis.min": {
    get section() {
      return t`Axes`;
    },
    get group() {
      return t`X-axis`;
    },
    index: 5,
    get title() {
      return t`Min`;
    },
    widget: "number",
    default: 0,
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.y_axis.auto_range"] !== false,
  },
  "graph.y_axis.max": {
    get section() {
      return t`Axes`;
    },
    get group() {
      return t`X-axis`;
    },
    index: 6,
    get title() {
      return t`Max`;
    },
    widget: "number",
    default: 100,
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.y_axis.auto_range"] !== false,
  },
  "graph.x_axis.labels_enabled": {
    get section() {
      return t`Axes`;
    },
    get group() {
      return t`Y-axis`;
    },
    index: 1,
    get title() {
      return t`Show label`;
    },
    inline: true,
    widget: "toggle",
    default: true,
  },
  "graph.x_axis.title_text": {
    get section() {
      return t`Axes`;
    },
    get title() {
      return t`Label`;
    },
    index: 2,
    get group() {
      return t`Y-axis`;
    },
    widget: "input",
    getHidden: (series, vizSettings) =>
      vizSettings["graph.x_axis.labels_enabled"] === false,
    getDefault: getDefaultDimensionLabel,
    getProps: (series) => ({
      placeholder: getDefaultDimensionLabel(series),
    }),
  },
  "graph.y_axis.labels_enabled": {
    get section() {
      return t`Axes`;
    },
    get title() {
      return t`Show label`;
    },
    index: 1,
    get group() {
      return t`X-axis`;
    },
    widget: "toggle",
    inline: true,
    default: true,
  },
  "graph.y_axis.title_text": {
    get section() {
      return t`Axes`;
    },
    get title() {
      return t`Label`;
    },
    index: 2,
    get group() {
      return t`X-axis`;
    },
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
            const metricCol = cols.find((c) => c.name === metric);
            return metricCol && metricCol.display_name;
          }),
        ),
      );
      return metricNames.length === 1 ? metricNames[0] : null;
    },
    readDependencies: ["series", "graph.metrics"],
  },
  "graph.show_values": {
    get section() {
      return t`Display`;
    },
    get title() {
      return t`Show values on data points`;
    },
    widget: "toggle",
    inline: true,
    getHidden: (_series, vizSettings) =>
      vizSettings["stackable.stack_type"] === "normalized",
    default: false,
  },
  "graph.label_value_formatting": {
    get section() {
      return t`Display`;
    },
    get title() {
      return t`Value labels formatting`;
    },
    widget: "segmentedControl",
    getHidden: (_series, vizSettings) =>
      vizSettings["graph.show_values"] !== true ||
      vizSettings["stackable.stack_type"] === "normalized",
    props: {
      options: [
        {
          get name() {
            return t`Compact`;
          },
          value: "compact",
        },
        {
          get name() {
            return t`Full`;
          },
          value: "full",
        },
      ],
    },
    default: "full",
    readDependencies: ["graph.show_values"],
  },
};
