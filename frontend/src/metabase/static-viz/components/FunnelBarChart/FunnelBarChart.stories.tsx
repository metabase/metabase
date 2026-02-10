import type { StoryFn } from "@storybook/react-webpack5";

import { color } from "metabase/lib/colors";
import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import {
  type StaticChartProps,
  StaticVisualization,
} from "../StaticVisualization";

import { data } from "./stories-data";

export default {
  title: "Viz/Static Viz/FunnelBarChart",
  component: StaticVisualization,
};

const Template: StoryFn<StaticChartProps> = (args) => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <StaticVisualization {...args} isStorybook />
    </div>
  );
};

const renderingContext: RenderingContext = {
  getColor: color,
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  measureTextHeight: (_, style) => measureTextHeight(Number(style.size)),
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

export const Default = {
  render: Template,
  args: {
    rawSeries: data.funnelBarCategorical as any,
    renderingContext,
  },
};

export const FunnelBarOrderedRows = {
  render: Template,
  args: {
    rawSeries: data.funnelBarOrderedRows as any,
    renderingContext,
  },
};

export const FunnelBarUnorderedRows = {
  render: Template,
  args: {
    rawSeries: data.funnelBarUnorderedRows as any,
    renderingContext,
  },
};
