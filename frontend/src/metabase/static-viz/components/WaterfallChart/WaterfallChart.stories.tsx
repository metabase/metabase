import type { StoryFn } from "@storybook/react-webpack5";

import { color } from "metabase/lib/colors";
import { data } from "metabase/static-viz/components/WaterfallChart/stories-data";
import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
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
    rawSeries: data.yAxisCompactWithoutDataLabels as any,
    renderingContext,
  },
};

export const YAxisAutoCompactWithDataLabels = {
  render: Template,

  args: {
    rawSeries: data.yAxisAutoCompactWithDataLabels as any,
    renderingContext,
  },
};

export const YAxisFullWithDataLabels = {
  render: Template,

  args: {
    rawSeries: data.yAxisFullWithDataLabels as any,
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

export const TimeseriesXScale = {
  render: Template,

  args: {
    rawSeries: data.timeseriesXScale as any,
    renderingContext,
  },
};

export const TimeseriesXScaleUnsorted = {
  render: Template,

  args: {
    rawSeries: data.timeseriesXScaleUnsorted as any,
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

export const TimeSeriesDataAsOrdinalXScale = {
  render: Template,

  args: {
    rawSeries: data.timeSeriesDataAsOrdinalXScale as any,
    renderingContext,
  },
};

export const UnaggregatedOrdinal = {
  render: Template,

  args: {
    rawSeries: data.unaggregatedOrdinal as any,
    renderingContext,
  },
};

export const UnaggregatedLinear = {
  render: Template,

  args: {
    rawSeries: data.unaggregatedLinear as any,
    renderingContext,
  },
};

export const UnaggregatedTimeseries = {
  render: Template,

  args: {
    rawSeries: data.unaggregatedTimeseries as any,
    renderingContext,
  },
};

export const MixedAboveZero = {
  render: Template,

  args: {
    rawSeries: data.mixedAboveZero as any,
    renderingContext,
  },
};

export const MixedBelowZero = {
  render: Template,

  args: {
    rawSeries: data.mixedBelowZero as any,
    renderingContext,
  },
};

export const NegativeOnly = {
  render: Template,

  args: {
    rawSeries: data.negativeOnly as any,
    renderingContext,
  },
};

export const StartsAboveZeroEndsBelow = {
  render: Template,

  args: {
    rawSeries: data.startsAboveZeroEndsBelow as any,
    renderingContext,
  },
};

export const StartsBelowZeroEndsAbove = {
  render: Template,

  args: {
    rawSeries: data.startsBelowZeroEndsAbove as any,
    renderingContext,
  },
};

export const StartsAboveZeroCrossesEndsAbove = {
  render: Template,

  args: {
    rawSeries: data.startsAboveZeroCrossesEndsAbove as any,
    renderingContext,
  },
};

export const StartsBelowZeroCrossesEndsBelow = {
  render: Template,

  args: {
    rawSeries: data.startsBelowZeroCrossesEndsBelow as any,
    renderingContext,
  },
};

export const CustomColors = {
  render: Template,

  args: {
    rawSeries: data.customColors as any,
    renderingContext,
  },
};

export const NoTotalTimeseries = {
  render: Template,

  args: {
    rawSeries: data.noTotalTimeseries as any,
    renderingContext,
  },
};

export const NoTotalOrdinal = {
  render: Template,

  args: {
    rawSeries: data.noTotalOrdinal as any,
    renderingContext,
  },
};

export const DataLabels = {
  render: Template,

  args: {
    rawSeries: data.dataLabels as any,
    renderingContext,
  },
};

export const DataLabelsColumnFormatting = {
  render: Template,

  args: {
    rawSeries: data.dataLabelsColumnFormatting as any,
    renderingContext,
  },
};

export const DataLabelsTimeseries = {
  render: Template,

  args: {
    rawSeries: data.dataLabelsTimeseries as any,
    renderingContext,
  },
};

export const DataLabelsMixed = {
  render: Template,

  args: {
    rawSeries: data.dataLabelsMixed as any,
    renderingContext,
  },
};

export const PowYScale = {
  render: Template,

  args: {
    rawSeries: data.powYScale as any,
    renderingContext,
  },
};

export const PowYScaleNegativeOnly = {
  render: Template,

  args: {
    rawSeries: data.powYScaleNegativeOnly as any,
    renderingContext,
  },
};

export const PowYScaleMixed = {
  render: Template,

  args: {
    rawSeries: data.powYScaleMixed as any,
    renderingContext,
  },
};

export const LogYScale = {
  render: Template,

  args: {
    rawSeries: data.logYScale as any,
    renderingContext,
  },
};

export const LogYScaleNegative = {
  render: Template,

  args: {
    rawSeries: data.logYScaleNegative as any,
    renderingContext,
  },
};

export const NativeTimeSeriesQuarter = {
  render: Template,

  args: {
    rawSeries: data.nativeTimeSeriesQuarter as any,
    renderingContext,
  },
};

export const NativeTimeSeriesWithGaps = {
  render: Template,

  args: {
    rawSeries: data.nativeTimeSeriesWithGaps as any,
    renderingContext,
  },
};

export const StructuredTimeSeriesYear = {
  render: Template,

  args: {
    rawSeries: data.structuredTimeSeriesYear as any,
    renderingContext,
  },
};

export const TimeXScaleTwoBarsWithoutTotal = {
  render: Template,

  args: {
    rawSeries: data.timeXScaleTwoBarsWithoutTotal as any,
    renderingContext,
  },
};

export const EnourmousDataset = {
  render: Template,

  args: {
    rawSeries: data.enormousDataset as any,
    renderingContext,
  },
};

export const Nulls = {
  render: Template,

  args: {
    rawSeries: data.nulls as any,
    renderingContext,
  },
};

export const NullXAxisValue = {
  render: Template,

  args: {
    rawSeries: data.nullXAxisValue as any,
    renderingContext,
  },
};

export const LinearNullDimension = {
  render: Template,

  args: {
    rawSeries: data.linearNullDimension as any,
    renderingContext,
  },
};

export const OrdinalNullDimension = {
  render: Template,

  args: {
    rawSeries: data.ordinalNullDimension as any,
    renderingContext,
  },
};

export const TwoBarsWithTotal = {
  render: Template,

  args: {
    rawSeries: data.twoBarsWithTotal as any,
    renderingContext,
  },
};

export const Watermark = {
  render: Template,

  args: {
    rawSeries: data.yAxisFullWithDataLabels as any,
    renderingContext,
    hasDevWatermark: true,
  },
};
