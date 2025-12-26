import type { StoryFn } from "@storybook/react";

import { color } from "metabase/lib/colors";
import {
  METRIC_COLUMN_WITH_SCALING,
  MULTIPLE_SERIES,
  MANY_CATEGORY_GROUPED,
  MANY_CATEGORY_UNGROUPED,
} from "metabase/static-viz/components/RowChart/stories-data";

import {
  type StaticChartProps,
  StaticVisualization,
} from "../StaticVisualization";

export default {
  title: "Viz/Static Viz/RowChart",
  component: StaticVisualization,
};

const Template: StoryFn<StaticChartProps> = (args) => {
  return <StaticVisualization {...args} />;
};

const ScrollableTemplate: StoryFn<StaticChartProps> = (args) => {
  return (
    <div
      style={{
        height: 400,
        overflowY: "auto",
        padding: "1rem",
        background: "#fff",
      }}
    >
      <StaticVisualization {...args} />
    </div>
  );
};

export const Default = {
  render: Template,
  args: { ...MULTIPLE_SERIES, getColor: color },
};

export const MetricColumnWithScaling = {
  render: Template,

  args: {
    ...METRIC_COLUMN_WITH_SCALING,
    getColor: color,
  },
};

export const Watermark = {
  render: Template,
  args: { ...MULTIPLE_SERIES, getColor: color, hasDevWatermark: true },
};

export const OverflowGrouped = {
  render: ScrollableTemplate,
  args: {
    ...MANY_CATEGORY_GROUPED,
    getColor: color,
  },
};

export const OverflowUngrouped = {
  render: ScrollableTemplate,
  args: {
    ...MANY_CATEGORY_UNGROUPED,
    getColor: color,
  },
};
