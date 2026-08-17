import type { StoryFn } from "@storybook/react";
import { updateIn } from "icepick";

import { data } from "metabase/static-viz/components/WaterfallChart/stories-data";
import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { color } from "metabase/ui/colors";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import type { StaticChartProps } from "../StaticVisualization";
import { StaticVisualization } from "../StaticVisualization";

export default {
  title: "Viz/Static Viz/WaterfallChart",
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

export const YAxisCompactWithoutDataLabels = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.yAxisCompactWithoutDataLabels as any,
    renderingContext,
  },
};

export const YAxisAutoCompactWithDataLabels = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.yAxisAutoCompactWithDataLabels as any,
    renderingContext,
  },
};

export const YAxisFullWithDataLabels = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.yAxisFullWithDataLabels as any,
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

export const TimeseriesXScale = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.timeseriesXScale as any,
    renderingContext,
  },
};

export const TimeseriesXScaleUnsorted = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.timeseriesXScaleUnsorted as any,
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

export const TimeSeriesDataAsOrdinalXScale = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.timeSeriesDataAsOrdinalXScale as any,
    renderingContext,
  },
};

export const UnaggregatedOrdinal = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.unaggregatedOrdinal as any,
    renderingContext,
  },
};

export const UnaggregatedLinear = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.unaggregatedLinear as any,
    renderingContext,
  },
};

export const UnaggregatedTimeseries = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.unaggregatedTimeseries as any,
    renderingContext,
  },
};

export const MixedAboveZero = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.mixedAboveZero as any,
    renderingContext,
  },
};

export const MixedBelowZero = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.mixedBelowZero as any,
    renderingContext,
  },
};

export const NegativeOnly = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.negativeOnly as any,
    renderingContext,
  },
};

export const StartsAboveZeroEndsBelow = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.startsAboveZeroEndsBelow as any,
    renderingContext,
  },
};

export const StartsBelowZeroEndsAbove = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.startsBelowZeroEndsAbove as any,
    renderingContext,
  },
};

export const StartsAboveZeroCrossesEndsAbove = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.startsAboveZeroCrossesEndsAbove as any,
    renderingContext,
  },
};

export const StartsBelowZeroCrossesEndsBelow = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.startsBelowZeroCrossesEndsBelow as any,
    renderingContext,
  },
};

export const CustomColors = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.customColors as any,
    renderingContext,
  },
};

export const NoTotalTimeseries = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.noTotalTimeseries as any,
    renderingContext,
  },
};

export const NoTotalOrdinal = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.noTotalOrdinal as any,
    renderingContext,
  },
};

export const DataLabels = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.dataLabels as any,
    renderingContext,
  },
};

export const DataLabelsColumnFormatting = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.dataLabelsColumnFormatting as any,
    renderingContext,
  },
};

export const DataLabelsTimeseries = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.dataLabelsTimeseries as any,
    renderingContext,
  },
};

export const DataLabelsMixed = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.dataLabelsMixed as any,
    renderingContext,
  },
};

export const PowYScale = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.powYScale as any,
    renderingContext,
  },
};

export const PowYScaleNegativeOnly = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.powYScaleNegativeOnly as any,
    renderingContext,
  },
};

export const PowYScaleMixed = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.powYScaleMixed as any,
    renderingContext,
  },
};

export const LogYScale = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.logYScale as any,
    renderingContext,
  },
};

export const LogYScaleNegative = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.logYScaleNegative as any,
    renderingContext,
  },
};

export const NativeTimeSeriesQuarter = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.nativeTimeSeriesQuarter as any,
    renderingContext,
  },
};

export const NativeTimeSeriesWithGaps = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.nativeTimeSeriesWithGaps as any,
    renderingContext,
  },
};

export const StructuredTimeSeriesYear = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.structuredTimeSeriesYear as any,
    renderingContext,
  },
};

export const TimeXScaleTwoBarsWithoutTotal = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.timeXScaleTwoBarsWithoutTotal as any,
    renderingContext,
  },
};

export const EnourmousDataset = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.enormousDataset as any,
    renderingContext,
  },
};

export const Nulls = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.nulls as any,
    renderingContext,
  },
};

export const NullXAxisValue = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.nullXAxisValue as any,
    renderingContext,
  },
};

export const LinearNullDimension = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.linearNullDimension as any,
    renderingContext,
  },
};

export const OrdinalNullDimension = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.ordinalNullDimension as any,
    renderingContext,
  },
};

export const TwoBarsWithTotal = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.twoBarsWithTotal as any,
    renderingContext,
  },
};

export const Watermark = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.yAxisFullWithDataLabels as any,
    renderingContext,
    hasDevWatermark: true,
  },
};

export const WithGoalLine = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: updateIn(
      data.yAxisFullWithDataLabels,
      [0, "card", "visualization_settings"],
      (settings) => {
        return {
          ...settings,
          "graph.show_goal": true,
          "graph.goal_value": 250000,
          "graph.goal_label": "Target",
        };
      },
    ) as any,
    renderingContext,
  },
};
