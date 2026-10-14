import type { StoryFn } from "@storybook/react";

import { color } from "metabase/ui/colors";

import {
  type StaticChartProps,
  StaticVisualization,
} from "../../StaticVisualization";
import {
  METRIC_COLUMN_WITH_SCALING,
  MULTIPLE_SERIES,
} from "../stories-data/row-chart";

export default {
  title: "Viz/Static Viz/RowChart",
  component: StaticVisualization,
};

const Template: StoryFn<StaticChartProps> = (args) => {
  return <StaticVisualization {...args} />;
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
