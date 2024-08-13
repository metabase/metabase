import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import { ScalarChart } from "./ScalarChart";
import { data } from "./stories-data";

export default {
  title: "static-viz/ScalarChart",
  component: ScalarChart,
};

const Template: ComponentStory<typeof ScalarChart> = args => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <ScalarChart {...args} isStorybook />
    </div>
  );
};

const renderingContext: RenderingContext = {
  getColor: color,
  formatValue: formatStaticValue as any,
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  measureTextHeight: (_, style) => measureTextHeight(Number(style.size)),
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: data.twoScalars as any,
  dashcardSettings: {},
  renderingContext,
};
