import type { Meta, StoryFn } from "@storybook/react";

import { Button } from "metabase/ui";

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
  title: "MetricsViewer/QueryExplorerBar",
  component: QueryExplorerBar,
} satisfies Meta<typeof QueryExplorerBar>;

const Template: StoryFn<QueryExplorerBarProps> = (args) => (
  <QueryExplorerBar {...args} />
);

export const Default = {
  render: Template,
  args: {
    chartTypes: CHART_TYPES,
    currentChartType: "line",
    onChartTypeChange: () => {},
  },
};

export const BarSelected = {
  render: Template,
  args: {
    chartTypes: CHART_TYPES,
    currentChartType: "bar",
    onChartTypeChange: () => {},
  },
};

/** Pass a table type as the last entry to enable table/chart switching. */
export const WithTableOption = {
  render: Template,
  args: {
    chartTypes: [...CHART_TYPES, { type: "table", icon: "table2" }],
    currentChartType: "table",
    onChartTypeChange: () => {},
  },
};

export const WithFilterControl = {
  render: Template,
  args: {
    chartTypes: CHART_TYPES,
    currentChartType: "line",
    onChartTypeChange: () => {},
    filterControl: (
      <Button variant="subtle" color="text-primary">
        All time
      </Button>
    ),
  },
};

export const WithGranularityControl = {
  render: Template,
  args: {
    chartTypes: CHART_TYPES,
    currentChartType: "line",
    onChartTypeChange: () => {},
    granularityControl: (
      <Button variant="subtle" color="text-primary">
        by month
      </Button>
    ),
  },
};

export const WithAllControls = {
  render: Template,
  args: {
    chartTypes: CHART_TYPES,
    currentChartType: "bar",
    onChartTypeChange: () => {},
    filterControl: (
      <Button variant="subtle" color="text-primary">
        All time
      </Button>
    ),
    granularityControl: (
      <Button variant="subtle" color="text-primary">
        by month
      </Button>
    ),
  },
};
