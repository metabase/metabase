import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";

import ColorRange from "./ColorRange";

export default {
  title: "Core/ColorRange",
  component: ColorRange,
};

const Template: ComponentStory<typeof ColorRange> = args => {
  return <ColorRange {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  colors: [color("white"), color("brand")],
};

export const Inverted = Template.bind({});
Inverted.args = {
  colors: [color("brand"), color("white")],
};

export const ThreeColors = Template.bind({});
ThreeColors.args = {
  colors: [color("error"), color("white"), color("success")],
};
