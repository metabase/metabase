import type { StoryFn } from "@storybook/react";

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
  title: "static-viz/PieChart",
  component: StaticVisualization,
};

const Template: StoryFn<StaticChartProps> = args => {
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

export const DefaultSettings = {
  render: Template,
  args: {
    rawSeries: data.defaultSettings as any,
    renderingContext,
  },
};

export const AllSettings = {
  render: Template,
  args: {
    rawSeries: data.allSettings as any,
    renderingContext,
  },
};

export const AutoCompactTotal = {
  render: Template,
  args: {
    rawSeries: data.autoCompactTotal as any,
    renderingContext,
  },
};

export const Colors = {
  render: Template,
  args: {
    rawSeries: data.colors as any,
    renderingContext,
  },
};

export const HideLegend = {
  render: Template,
  args: {
    rawSeries: data.hideLegend as any,
    renderingContext,
  },
};

export const HideTotal = {
  render: Template,
  args: {
    rawSeries: data.hideTotal as any,
    renderingContext,
  },
};

export const ReorderedRenamedSlices = {
  render: Template,
  args: {
    rawSeries: data.reorderedRenamedSlices as any,
    renderingContext,
  },
};

export const SmallMinimumSlicePercentage = {
  render: Template,
  args: {
    rawSeries: data.smallMinimumSlicePercentage as any,
    renderingContext,
  },
};

export const LargeMinimumSlicePercentage = {
  render: Template,
  args: {
    rawSeries: data.largeMinimumSlicePercentage as any,
    renderingContext,
  },
};

export const ZeroMinimumSlicePercentage = {
  render: Template,
  args: {
    rawSeries: data.zeroMinimumSlicePercentage as any,
    renderingContext,
  },
};

export const ShowPercentagesOff = {
  render: Template,
  args: {
    rawSeries: data.showPercentagesOff as any,
    renderingContext,
  },
};

export const ShowPercentagesOnChart = {
  render: Template,
  args: {
    rawSeries: data.showPercentagesOnChart as any,
    renderingContext,
  },
};

export const ShowPercentagesOnChartDense = {
  render: Template,
  args: {
    rawSeries: data.showPercentagesOnChartDense as any,
    renderingContext,
  },
};

export const AllNegative = {
  render: Template,
  args: {
    rawSeries: data.allNegative as any,
    renderingContext,
  },
};

export const AllNegativeWithOther = {
  render: Template,
  args: {
    rawSeries: data.allNegativeWithOther as any,
    renderingContext,
  },
};

export const MixedPositiveNegative = {
  render: Template,
  args: {
    rawSeries: data.mixedPostiiveNegative as any,
    renderingContext,
  },
};

export const ColumnFormatting = {
  render: Template,
  args: {
    rawSeries: data.columnFormatting as any,
    renderingContext,
  },
};

export const ColumnFormattingPercentagesOnChart = {
  render: Template,
  args: {
    rawSeries: data.columnFormattingPercentagesOnChart as any,
    renderingContext,
  },
};

export const BooleanDimension = {
  render: Template,
  args: {
    rawSeries: data.booleanDimension as any,
    renderingContext,
  },
};

export const NumericDimension = {
  render: Template,
  args: {
    rawSeries: data.numericDimension as any,
    renderingContext,
  },
};

export const BinnedDimension = {
  render: Template,
  args: {
    rawSeries: data.binnedDimension as any,
    renderingContext,
  },
};

export const DateDimension = {
  render: Template,
  args: {
    rawSeries: data.dateDimension as any,
    renderingContext,
  },
};

export const RelativeDateDimension = {
  render: Template,
  args: {
    rawSeries: data.relativeDateDimension as any,
    renderingContext,
  },
};

export const ShowPercentagesBoth = {
  render: Template,
  args: {
    rawSeries: data.showPercentagesBoth as any,
    renderingContext,
  },
};

export const NullDimension = {
  render: Template,
  args: {
    rawSeries: data.nullDimension as any,
    renderingContext,
  },
};

export const NumDecimalPlacesChart = {
  render: Template,
  args: {
    rawSeries: data.numDecimalPlacesChart as any,
    renderingContext,
  },
};

export const NumDecimalPlacesLegend = {
  render: Template,
  args: {
    rawSeries: data.numDecimalPlacesLegend as any,
    renderingContext,
  },
};

export const TruncatedTotal = {
  render: Template,
  args: {
    rawSeries: data.truncatedTotal as any,
    renderingContext,
  },
};

export const UnaggregatedDimension = {
  render: Template,
  args: {
    rawSeries: data.unaggregatedDimension as any,
    renderingContext,
  },
};

export const SingleDimension = {
  render: Template,
  args: {
    rawSeries: data.singleDimension as any,
    renderingContext,
  },
};

export const LongDimensionName = {
  render: Template,
  args: {
    rawSeries: data.longDimensionName as any,
    renderingContext,
  },
};

export const TinySlicesDisappear43766 = {
  render: Template,
  args: {
    rawSeries: data.tinySlicesDisappear43766 as any,
    renderingContext,
  },
};

export const MissingCurrencyFormatting44086 = {
  render: Template,
  args: {
    rawSeries: data.missingCurrencyFormatting44086 as any,
    renderingContext,
  },
};

export const MissingCurrencyFormatting2 = {
  render: Template,
  args: {
    rawSeries: data.missingCurrencyFormatting2 as any,
    renderingContext,
  },
};

export const MissingCurrencyFormatting3 = {
  render: Template,
  args: {
    rawSeries: data.missingCurrencyFormatting3 as any,
    renderingContext,
  },
};

export const MissingColors44087 = {
  render: Template,
  args: {
    rawSeries: data.missingColors44087 as any,
    renderingContext,
  },
};

export const InvalidDimensionSetting44085 = {
  render: Template,
  args: {
    rawSeries: data.invalidDimensionSetting44085 as any,
    renderingContext,
  },
};

export const PercentagesOnChartBooleanDimensionCrashes44085 = {
  render: Template,
  args: {
    rawSeries: data.percentagesOnChartBooleanDimensionCrashes44085 as any,
    renderingContext,
  },
};

export const AllZeroMetric44847 = {
  render: Template,
  args: {
    rawSeries: data.allZeroMetric44847 as any,
    renderingContext,
  },
};

export const NoSingleColumnLegend45149 = {
  render: Template,
  args: {
    rawSeries: data.noSingleColumnLegend45149 as any,
    renderingContext,
  },
};

export const NumericSQLColumnCrashes28568 = {
  render: Template,
  args: {
    rawSeries: data.numericSQLColumnCrashes28568 as any,
    renderingContext,
  },
};

export const MissingLabelLargeSlice38424 = {
  render: Template,
  args: {
    rawSeries: data.missingLabelLargeSlice38424 as any,
    renderingContext,
  },
};

export const TwoRings = Template.bind({});
TwoRings.args = {
  rawSeries: data.twoRings as any,
  renderingContext,
};

export const ThreeRings = Template.bind({});
ThreeRings.args = {
  rawSeries: data.threeRings as any,
  renderingContext,
};

export const ThreeRingsNoLabels = Template.bind({});
ThreeRingsNoLabels.args = {
  rawSeries: data.threeRingsNoLabels as any,
  renderingContext,
};

export const ThreeRingsPercentagesAndLabels = Template.bind({});
ThreeRingsPercentagesAndLabels.args = {
  rawSeries: data.threeRingsPercentagesAndLabels as any,
  renderingContext,
};

export const ThreeRingsPercentagesOnChart = Template.bind({});
ThreeRingsPercentagesOnChart.args = {
  rawSeries: data.threeRingsPercentagesOnChart as any,
  renderingContext,
};

export const ThreeRingsOtherSlices = Template.bind({});
ThreeRingsOtherSlices.args = {
  rawSeries: data.threeRingsOtherSlices as any,
  renderingContext,
};

export const LabelsWithPercent = Template.bind({});
LabelsWithPercent.args = {
  rawSeries: data.labelsWithPercent as any,
  renderingContext,
};

export const LabelsOnChart = Template.bind({});
LabelsOnChart.args = {
  rawSeries: data.labelsOnChart as any,
  renderingContext,
};

export const SunburstOtherLabel = Template.bind({});
SunburstOtherLabel.args = {
  rawSeries: data.sunburstOtherLabel as any,
  renderingContext,
};
