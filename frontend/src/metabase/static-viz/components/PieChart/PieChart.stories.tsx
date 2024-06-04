import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import type { RenderingContext } from "metabase/visualizations/types";

import { PieChart } from "./PieChart";
import { data } from "./stories-data";

export default {
  title: "static-viz/PieChart",
  component: PieChart,
};

const Template: ComponentStory<typeof PieChart> = args => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <PieChart {...args} isStorybook />
    </div>
  );
};

const renderingContext: RenderingContext = {
  getColor: color,
  formatValue: formatStaticValue as any,
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  fontFamily: "Lato",
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: data.defaultSettings as any,
  dashcardSettings: {},
  renderingContext,
};
