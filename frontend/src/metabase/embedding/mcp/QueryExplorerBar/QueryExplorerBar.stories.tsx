import type { Meta, StoryFn } from "@storybook/react";

import {
  QueryExplorerBar,
  type QueryExplorerBarChartType,
  type QueryExplorerBarProps,
} from "./QueryExplorerBar";

const CHART_TYPES: QueryExplorerBarChartType[] = [
  { type: "line", icon: "line" },
  { type: "area", icon: "area" },
  { type: "bar", icon: "bar" },
];

export default {
  title: "Embedding/MCP/QueryExplorerBar",
  component: QueryExplorerBar,
  argTypes: {
    currentChartType: {
      control: "select",
      options: ["table", "line", "area", "bar"],
    },
  },
} satisfies Meta<typeof QueryExplorerBar>;

const Template: StoryFn<QueryExplorerBarProps> = (args) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      background: "var(--mb-color-background-primary)",
    }}
  >
    <div
      style={{
        height: "300px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: "24px",
      }}
    >
      placeholder for where the chart would be
    </div>

    <div
      style={{
        padding: "12px",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <QueryExplorerBar {...args} />
    </div>
  </div>
);

export const Default = {
  render: Template,
  args: {
    chartTypes: CHART_TYPES,
    currentChartType: "bar",
    onChartTypeChange: () => {},
    timeRange: {
      label: "All time",
      value: undefined,
      availableUnits: [],
      hasActiveFilter: false,
      onChange: () => {},
      onClear: () => {},
    },
    timeGranularity: {
      label: "by month",
      currentUnit: "month",
      availableItems: [],
      onChange: () => {},
    },
    onExplore: () => {},
  },
};

export const WithTable = {
  render: Template,
  args: {
    ...Default.args,
    chartTypes: [{ type: "table", icon: "table2" }, ...CHART_TYPES],
    currentChartType: "table",
  },
};
