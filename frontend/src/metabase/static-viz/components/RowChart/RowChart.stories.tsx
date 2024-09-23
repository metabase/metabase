import type { StoryFn } from "@storybook/react";

import { color } from "metabase/lib/colors";
import {
  METRIC_COLUMN_WITH_SCALING,
  MULTIPLE_SERIES,
} from "metabase/static-viz/components/RowChart/stories-data";

import RowChart from "./RowChart";

export default {
  title: "static-viz/RowChart",
  component: RowChart,
};

const Template: StoryFn<typeof RowChart> = args => {
  return <RowChart {...args} />;
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
