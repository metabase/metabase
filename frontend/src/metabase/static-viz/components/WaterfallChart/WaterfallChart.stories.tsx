import type { StoryFn } from "@storybook/react";

import { IsomorphicVisualizationStory } from "__support__/storybook";
import { data } from "metabase/static-viz/components/WaterfallChart/stories-data";

import type { StaticChartProps } from "../StaticVisualization";
import { StaticVisualization } from "../StaticVisualization";

export default {
  title: "static-viz/WaterfallChart",
  component: StaticVisualization,
};

const Template: StoryFn<StaticChartProps> = args => {
  return <IsomorphicVisualizationStory {...args} />;
};

export const YAxisCompactWithoutDataLabels = {
  render: Template,
  args: {
    rawSeries: data.yAxisCompactWithoutDataLabels,
  },
};

export const YAxisAutoCompactWithDataLabels = {
  render: Template,
  args: {
    rawSeries: data.yAxisAutoCompactWithDataLabels,
  },
};

export const YAxisFullWithDataLabels = {
  render: Template,
  args: {
    rawSeries: data.yAxisFullWithDataLabels,
  },
};

export const CustomYAxisRangeWithColumnScaling = {
  render: Template,
  args: {
    rawSeries: data.customYAxisRangeWithColumnScaling,
  },
};

export const TimeseriesXScale = {
  render: Template,
  args: {
    rawSeries: data.timeseriesXScale,
  },
};

export const TimeseriesXScaleUnsorted = {
  render: Template,
  args: {
    rawSeries: data.timeseriesXScaleUnsorted,
  },
};

export const OrdinalXScale = {
  render: Template,
  args: {
    rawSeries: data.ordinalXScale,
  },
};

export const TimeSeriesDataAsOrdinalXScale = {
  render: Template,
  args: {
    rawSeries: data.timeSeriesDataAsOrdinalXScale,
  },
};

export const UnaggregatedOrdinal = {
  render: Template,
  args: {
    rawSeries: data.unaggregatedOrdinal,
  },
};

export const UnaggregatedLinear = {
  render: Template,
  args: {
    rawSeries: data.unaggregatedLinear,
  },
};

export const UnaggregatedTimeseries = {
  render: Template,
  args: {
    rawSeries: data.unaggregatedTimeseries,
  },
};

export const MixedAboveZero = {
  render: Template,
  args: {
    rawSeries: data.mixedAboveZero,
  },
};

export const MixedBelowZero = {
  render: Template,
  args: {
    rawSeries: data.mixedBelowZero,
  },
};

export const NegativeOnly = {
  render: Template,
  args: {
    rawSeries: data.negativeOnly,
  },
};

export const StartsAboveZeroEndsBelow = {
  render: Template,
  args: {
    rawSeries: data.startsAboveZeroEndsBelow,
  },
};

export const StartsBelowZeroEndsAbove = {
  render: Template,
  args: {
    rawSeries: data.startsBelowZeroEndsAbove,
  },
};

export const StartsAboveZeroCrossesEndsAbove = {
  render: Template,
  args: {
    rawSeries: data.startsAboveZeroCrossesEndsAbove,
  },
};

export const StartsBelowZeroCrossesEndsBelow = {
  render: Template,
  args: {
    rawSeries: data.startsBelowZeroCrossesEndsBelow,
  },
};

export const CustomColors = {
  render: Template,
  args: {
    rawSeries: data.customColors,
  },
};

export const NoTotalTimeseries = {
  render: Template,
  args: {
    rawSeries: data.noTotalTimeseries,
  },
};

export const NoTotalOrdinal = {
  render: Template,
  args: {
    rawSeries: data.noTotalOrdinal,
  },
};

export const DataLabels = {
  render: Template,
  args: {
    rawSeries: data.dataLabels,
  },
};

export const DataLabelsColumnFormatting = {
  render: Template,
  args: {
    rawSeries: data.dataLabelsColumnFormatting,
  },
};

export const DataLabelsTimeseries = {
  render: Template,
  args: {
    rawSeries: data.dataLabelsTimeseries,
  },
};

export const DataLabelsMixed = {
  render: Template,
  args: {
    rawSeries: data.dataLabelsMixed,
  },
};

export const PowYScale = {
  render: Template,
  args: {
    rawSeries: data.powYScale,
  },
};

export const PowYScaleNegativeOnly = {
  render: Template,
  args: {
    rawSeries: data.powYScaleNegativeOnly,
  },
};

export const PowYScaleMixed = {
  render: Template,
  args: {
    rawSeries: data.powYScaleMixed,
  },
};

export const LogYScale = {
  render: Template,
  args: {
    rawSeries: data.logYScale,
  },
};

export const LogYScaleNegative = {
  render: Template,
  args: {
    rawSeries: data.logYScaleNegative,
  },
};

export const NativeTimeSeriesQuarter = {
  render: Template,
  args: {
    rawSeries: data.nativeTimeSeriesQuarter,
  },
};

export const NativeTimeSeriesWithGaps = {
  render: Template,
  args: {
    rawSeries: data.nativeTimeSeriesWithGaps,
  },
};

export const StructuredTimeSeriesYear = {
  render: Template,
  args: {
    rawSeries: data.structuredTimeSeriesYear,
  },
};

export const TimeXScaleTwoBarsWithoutTotal = {
  render: Template,
  args: {
    rawSeries: data.timeXScaleTwoBarsWithoutTotal,
  },
};

export const EnourmousDataset = {
  render: Template,
  args: {
    rawSeries: data.enormousDataset,
  },
};

export const Nulls = {
  render: Template,
  args: {
    rawSeries: data.nulls,
  },
};

export const NullXAxisValue = {
  render: Template,
  args: {
    rawSeries: data.nullXAxisValue,
  },
};

export const LinearNullDimension = {
  render: Template,
  args: {
    rawSeries: data.linearNullDimension,
  },
};

export const OrdinalNullDimension = {
  render: Template,
  args: {
    rawSeries: data.ordinalNullDimension,
  },
};

export const TwoBarsWithTotal = {
  render: Template,
  args: {
    rawSeries: data.twoBarsWithTotal,
  },
};
