import type { ComponentStory } from "@storybook/react";
import { color } from "metabase/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { measureTextWidth } from "metabase/static-viz/lib/text";
import * as questions from "metabase/static-viz/components/ComboChart/stories-data";
import { ComboChart } from "./ComboChart";

export default {
  title: "static-viz/ComboChart",
  component: ComboChart,
};

const Template: ComponentStory<typeof ComboChart> = args => {
  return <ComboChart {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: questions.autoYSplit as any,
  dashcardSettings: {},
  renderingContext: {
    getColor: color,
    formatValue: formatStaticValue as any,
    measureText: measureTextWidth as any,
    fontFamily: "Lato",
  },
};
