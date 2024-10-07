import type { StoryFn } from "@storybook/react";

import { IsomorphicVisualizationStory } from "__support__/storybook";

import type { StaticChartProps } from "../StaticVisualization";

import { data } from "./stories-data";

export default {
  title: "static-viz/PieChart",
  component: IsomorphicVisualizationStory,
};

const Template: StoryFn<StaticChartProps> = args => {
  return <IsomorphicVisualizationStory {...args} />;
};

export const DefaultSettings = {
  render: Template,
  args: {
    rawSeries: data.defaultSettings,
  },
};

export const AllSettings = {
  render: Template,
  args: {
    rawSeries: data.allSettings,
  },
};

export const AutoCompactTotal = {
  render: Template,
  args: {
    rawSeries: data.autoCompactTotal,
  },
};

export const Colors = {
  render: Template,
  args: {
    rawSeries: data.colors,
  },
};

export const HideLegend = {
  render: Template,
  args: {
    rawSeries: data.hideLegend,
  },
};

export const HideTotal = {
  render: Template,
  args: {
    rawSeries: data.hideTotal,
  },
};

export const ReorderedRenamedSlices = {
  render: Template,
  args: {
    rawSeries: data.reorderedRenamedSlices,
  },
};

export const SmallMinimumSlicePercentage = {
  render: Template,
  args: {
    rawSeries: data.smallMinimumSlicePercentage,
  },
};

export const LargeMinimumSlicePercentage = {
  render: Template,
  args: {
    rawSeries: data.largeMinimumSlicePercentage,
  },
};

export const ZeroMinimumSlicePercentage = {
  render: Template,
  args: {
    rawSeries: data.zeroMinimumSlicePercentage,
  },
};

export const ShowPercentagesOff = {
  render: Template,
  args: {
    rawSeries: data.showPercentagesOff,
  },
};

export const ShowPercentagesOnChart = {
  render: Template,
  args: {
    rawSeries: data.showPercentagesOnChart,
  },
};

export const ShowPercentagesOnChartDense = {
  render: Template,
  args: {
    rawSeries: data.showPercentagesOnChartDense,
  },
};

export const AllNegative = {
  render: Template,
  args: {
    rawSeries: data.allNegative,
  },
};

export const MixedPositiveNegative = {
  render: Template,
  args: {
    rawSeries: data.mixedPostiiveNegative,
  },
};

export const ColumnFormatting = {
  render: Template,
  args: {
    rawSeries: data.columnFormatting,
  },
};

export const ColumnFormattingPercentagesOnChart = {
  render: Template,
  args: {
    rawSeries: data.columnFormattingPercentagesOnChart,
  },
};

export const BooleanDimension = {
  render: Template,
  args: {
    rawSeries: data.booleanDimension,
  },
};

export const NumericDimension = {
  render: Template,
  args: {
    rawSeries: data.numericDimension,
  },
};

export const BinnedDimension = {
  render: Template,
  args: {
    rawSeries: data.binnedDimension,
  },
};

export const DateDimension = {
  render: Template,
  args: {
    rawSeries: data.dateDimension,
  },
};

export const RelativeDateDimension = {
  render: Template,
  args: {
    rawSeries: data.relativeDateDimension,
  },
};

export const ShowPercentagesBoth = {
  render: Template,
  args: {
    rawSeries: data.showPercentagesBoth,
  },
};

export const NullDimension = {
  render: Template,
  args: {
    rawSeries: data.nullDimension,
  },
};

export const NumDecimalPlacesChart = {
  render: Template,
  args: {
    rawSeries: data.numDecimalPlacesChart,
  },
};

export const NumDecimalPlacesLegend = {
  render: Template,
  args: {
    rawSeries: data.numDecimalPlacesLegend,
  },
};

export const TruncatedTotal = {
  render: Template,
  args: {
    rawSeries: data.truncatedTotal,
  },
};

export const UnaggregatedDimension = {
  render: Template,
  args: {
    rawSeries: data.unaggregatedDimension,
  },
};

export const SingleDimension = {
  render: Template,
  args: {
    rawSeries: data.singleDimension,
  },
};

export const LongDimensionName = {
  render: Template,
  args: {
    rawSeries: data.longDimensionName,
  },
};

export const TinySlicesDisappear43766 = {
  render: Template,
  args: {
    rawSeries: data.tinySlicesDisappear43766,
  },
};

export const MissingCurrencyFormatting44086 = {
  render: Template,
  args: {
    rawSeries: data.missingCurrencyFormatting44086,
  },
};

export const MissingCurrencyFormatting2 = {
  render: Template,
  args: {
    rawSeries: data.missingCurrencyFormatting2,
  },
};

export const MissingCurrencyFormatting3 = {
  render: Template,
  args: {
    rawSeries: data.missingCurrencyFormatting3,
  },
};

export const MissingColors44087 = {
  render: Template,
  args: {
    rawSeries: data.missingColors44087,
  },
};

export const InvalidDimensionSetting44085 = {
  render: Template,
  args: {
    rawSeries: data.invalidDimensionSetting44085,
  },
};

export const PercentagesOnChartBooleanDimensionCrashes44085 = {
  render: Template,
  args: {
    rawSeries: data.percentagesOnChartBooleanDimensionCrashes44085,
  },
};

export const AllZeroMetric44847 = {
  render: Template,
  args: {
    rawSeries: data.allZeroMetric44847,
  },
};

export const NoSingleColumnLegend45149 = {
  render: Template,
  args: {
    rawSeries: data.noSingleColumnLegend45149,
  },
};

export const NumericSQLColumnCrashes28568 = {
  render: Template,
  args: {
    rawSeries: data.numericSQLColumnCrashes28568,
  },
};

export const MissingLabelLargeSlice38424 = {
  render: Template,
  args: {
    rawSeries: data.missingLabelLargeSlice38424,
  },
};

export const TwoRings = {
  render: Template,
  args: {
    rawSeries: data.twoRings,
  },
};

export const ThreeRings = {
  render: Template,
  args: {
    rawSeries: data.threeRings,
  },
};

export const ThreeRingsNoLabels = {
  render: Template,
  args: {
    rawSeries: data.threeRingsNoLabels,
  },
};

export const ThreeRingsPercentagesAndLabels = {
  render: Template,
  args: {
    rawSeries: data.threeRingsPercentagesAndLabels,
  },
};

export const ThreeRingsPercentagesOnChart = {
  render: Template,
  args: {
    rawSeries: data.threeRingsPercentagesOnChart,
  },
};

export const ThreeRingsOtherSlices = {
  render: Template,
  args: {
    rawSeries: data.threeRingsOtherSlices,
  },
};

export const LabelsWithPercent = {
  render: Template,
  args: {
    rawSeries: data.labelsWithPercent,
  },
};

export const LabelsOnChart = {
  render: Template,
  args: {
    rawSeries: data.labelsOnChart,
  },
};
