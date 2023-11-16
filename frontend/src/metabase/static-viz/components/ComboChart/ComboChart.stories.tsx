import type { ComponentStory } from "@storybook/react";
import { color } from "metabase/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import * as questions from "metabase/static-viz/components/ComboChart/stories-data";
import type { RenderingContext } from "metabase/visualizations/types";
import { ComboChart } from "./ComboChart";

export default {
  title: "static-viz/ComboChart",
  component: ComboChart,
};

const Template: ComponentStory<typeof ComboChart> = args => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <ComboChart {...args} />
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

export const SplitYAxis = Template.bind({});
SplitYAxis.args = {
  rawSeries: questions.autoYSplit as any,
  dashcardSettings: {},
  renderingContext,
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: questions.messedUpAxis as any,
  dashcardSettings: {},
  renderingContext,
};
