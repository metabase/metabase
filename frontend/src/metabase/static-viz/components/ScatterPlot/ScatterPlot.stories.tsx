import type { StoryFn } from "@storybook/react";
import { updateIn } from "icepick";

import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { color } from "metabase/ui/colors";
import {
  DEFAULT_VISUALIZATION_THEME,
  type RenderingContext,
} from "metabase/viz-core";

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
    // Unjustified type cast. FIXME
    rawSeries: data.default as any,
    renderingContext,
  },
};

export const CustomYAxisRangeWithColumnScaling = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.customYAxisRangeWithColumnScaling as any,
    renderingContext,
  },
};

export const MultiMetricSeries = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.multiMetricSeries as any,
    renderingContext,
  },
};

export const MultiDimensionBreakout = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.multiDimensionBreakout as any,
    renderingContext,
  },
};

export const BubbleSize = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.bubbleSize as any,
    renderingContext,
  },
};

export const MultiDimensionBreakoutBubbleSize = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.multiDimensionBreakoutBubbleSize as any,
    renderingContext,
  },
};

export const PowerXScale = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.powerXScale as any,
    renderingContext,
  },
};

export const PowerXScaleMultiSeries = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.powerXScaleMultiSeries as any,
    renderingContext,
  },
};

export const LogXScale = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.logXScale as any,
    renderingContext,
  },
};

export const LogXScaleAtOne = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.logXScaleAtOne as any,
    renderingContext,
  },
};

export const HistogramXScale = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.histogramXScale as any,
    renderingContext,
  },
};

export const OrdinalXScale = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.ordinalXScale as any,
    renderingContext,
  },
};

export const TimeseriesXScale = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.timeseriesXScale as any,
    renderingContext,
  },
};

export const CustomYAxisRange = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.customYAxisRange as any,
    renderingContext,
  },
};

export const AutoYAxisExcludeZeroWithGoal = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.autoYAxisExcludeZeroWithGoal as any,
    renderingContext,
  },
};

export const GoalLine = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.goalLine as any,
    renderingContext,
  },
};

export const PinToZero = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.pinToZero as any,
    renderingContext,
  },
};

export const Watermark = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.default as any,
    renderingContext,
    hasDevWatermark: true,
  },
};

export const CustomYAxisRangeOffScreen = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: updateIn(
      data.default,
      [0, "card", "visualization_settings"],
      (val) => ({
        ...val,
        "graph.y_axis.auto_range": false,
        "graph.y_axis.min": 100000,
        "graph.y_axis.max": 200000,
      }),
    ) as any,
    renderingContext,
  },
};
