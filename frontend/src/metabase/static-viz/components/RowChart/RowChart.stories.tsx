import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";
import { MULTIPLE_SERIES } from "metabase/static-viz/components/RowChart/stories-data";

import RowChart from "./RowChart";

export default {
  title: "static-viz/RowChart",
  component: RowChart,
};

const Template: ComponentStory<typeof RowChart> = args => {
  return <RowChart {...args} />;
};

export const Default = Template.bind({});
Default.args = { ...MULTIPLE_SERIES, getColor: color };
