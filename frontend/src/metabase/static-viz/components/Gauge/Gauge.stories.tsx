import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";
import GaugeContainer from "metabase/static-viz/components/Gauge/GaugeContainer";
import {
  DEFAULT,
  WITH_FORMATTING,
} from "metabase/static-viz/components/Gauge/stories-data";

export default {
  title: "static-viz/Gauge",
  component: GaugeContainer,
};

const Template: ComponentStory<typeof GaugeContainer> = args => {
  return <GaugeContainer {...args} />;
};

export const Default = Template.bind({});
Default.args = { ...DEFAULT, getColor: color };

export const WithFormatting = Template.bind({});
WithFormatting.args = { ...WITH_FORMATTING, getColor: color };
