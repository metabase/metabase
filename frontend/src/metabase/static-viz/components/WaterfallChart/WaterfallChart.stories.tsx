import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";
import { data } from "metabase/static-viz/components/WaterfallChart/stories-data";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import type { RenderingContext } from "metabase/visualizations/types";

import { WaterfallChart } from "./WaterfallChart";

export default {
  title: "static-viz/WaterfallChart",
  component: WaterfallChart,
};

const Template: ComponentStory<typeof WaterfallChart> = args => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <WaterfallChart {...args} />
    </div>
  );
};

const renderingContext: RenderingContext = {
  getColor: color,
  formatValue: formatStaticValue as any,
  measureText: (text, style) =>
    measureTextWidth(text, style.size, style.weight),
  fontFamily: "Lato",
};

export const WithoutTotal = Template.bind({});
WithoutTotal.args = {
  rawSeries: data.withoutTotal as any,
  dashcardSettings: {},
  renderingContext,
};
