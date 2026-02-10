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
  title: "Viz/Static Viz/ScatterPlot",
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
    rawSeries: data.default as any,
    renderingContext,
  },
};

export const CustomYAxisRangeWithColumnScaling = {
  render: Template,

  args: {
    rawSeries: data.customYAxisRangeWithColumnScaling as any,
    renderingContext,
  },
};

export const MultiMetricSeries = {
  render: Template,

  args: {
    rawSeries: data.multiMetricSeries as any,
    renderingContext,
  },
};

export const MultiDimensionBreakout = {
  render: Template,

  args: {
    rawSeries: data.multiDimensionBreakout as any,
    renderingContext,
  },
};

export const BubbleSize = {
  render: Template,

  args: {
    rawSeries: data.bubbleSize as any,
    renderingContext,
  },
};

export const MultiDimensionBreakoutBubbleSize = {
  render: Template,

  args: {
    rawSeries: data.multiDimensionBreakoutBubbleSize as any,
    renderingContext,
  },
};

export const PowerXScale = {
  render: Template,

  args: {
    rawSeries: data.powerXScale as any,
    renderingContext,
  },
};

export const PowerXScaleMultiSeries = {
  render: Template,

  args: {
    rawSeries: data.powerXScaleMultiSeries as any,
    renderingContext,
  },
};

export const LogXScale = {
  render: Template,

  args: {
    rawSeries: data.logXScale as any,
    renderingContext,
  },
};

export const LogXScaleAtOne = {
  render: Template,

  args: {
    rawSeries: data.logXScaleAtOne as any,
    renderingContext,
  },
};

export const HistogramXScale = {
  render: Template,

  args: {
    rawSeries: data.histogramXScale as any,
    renderingContext,
  },
};

export const OrdinalXScale = {
  render: Template,

  args: {
    rawSeries: data.ordinalXScale as any,
    renderingContext,
  },
};

export const TimeseriesXScale = {
  render: Template,

  args: {
    rawSeries: data.timeseriesXScale as any,
    renderingContext,
  },
};

export const CustomYAxisRange = {
  render: Template,

  args: {
    rawSeries: data.customYAxisRange as any,
    renderingContext,
  },
};

export const AutoYAxisExcludeZeroWithGoal = {
  render: Template,

  args: {
    rawSeries: data.autoYAxisExcludeZeroWithGoal as any,
    renderingContext,
  },
};

export const GoalLine = {
  render: Template,

  args: {
    rawSeries: data.goalLine as any,
    renderingContext,
  },
};

export const PinToZero = {
  render: Template,

  args: {
    rawSeries: data.pinToZero as any,
    renderingContext,
  },
};

export const Watermark = {
  render: Template,

  args: {
    rawSeries: data.default as any,
    renderingContext,
    hasDevWatermark: true,
  },
};
