import type { StoryFn } from "@storybook/react-webpack5";

import { color } from "metabase/lib/colors";
import {
  METRIC_COLUMN_WITH_SCALING,
  MULTIPLE_SERIES,
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
