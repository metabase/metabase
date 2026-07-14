import type { StoryFn } from "@storybook/react";

import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { color } from "metabase/ui/colors";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import {
  type StaticChartProps,
  StaticVisualization,
} from "../StaticVisualization";

import { data } from "./stories-data";

export default {
  title: "Viz/Static Viz/PieChart",
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

export const DefaultSettings = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.defaultSettings as any,
    renderingContext,
  },
};

export const AllSettings = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.allSettings as any,
    renderingContext,
  },
};

export const AutoCompactTotal = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.autoCompactTotal as any,
    renderingContext,
  },
};

export const Colors = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.colors as any,
    renderingContext,
  },
};

export const HideLegend = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.hideLegend as any,
    renderingContext,
  },
};

export const HideTotal = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.hideTotal as any,
    renderingContext,
  },
};

export const ReorderedRenamedSlices = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.reorderedRenamedSlices as any,
    renderingContext,
  },
};

export const SmallMinimumSlicePercentage = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.smallMinimumSlicePercentage as any,
    renderingContext,
  },
};

export const LargeMinimumSlicePercentage = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.largeMinimumSlicePercentage as any,
    renderingContext,
  },
};

export const ZeroMinimumSlicePercentage = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.zeroMinimumSlicePercentage as any,
    renderingContext,
  },
};

export const ShowPercentagesOff = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.showPercentagesOff as any,
    renderingContext,
  },
};

export const ShowPercentagesOnChart = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.showPercentagesOnChart as any,
    renderingContext,
  },
};

export const ShowPercentagesOnChartDense = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.showPercentagesOnChartDense as any,
    renderingContext,
  },
};

export const AllNegative = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.allNegative as any,
    renderingContext,
  },
};

export const AllNegativeWithOther = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.allNegativeWithOther as any,
    renderingContext,
  },
};

export const MixedPositiveNegative = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.mixedPostiiveNegative as any,
    renderingContext,
  },
};

export const ColumnFormatting = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.columnFormatting as any,
    renderingContext,
  },
};

export const ColumnFormattingPercentagesOnChart = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.columnFormattingPercentagesOnChart as any,
    renderingContext,
  },
};

export const BooleanDimension = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.booleanDimension as any,
    renderingContext,
  },
};

export const NumericDimension = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.numericDimension as any,
    renderingContext,
  },
};

export const BinnedDimension = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.binnedDimension as any,
    renderingContext,
  },
};

export const DateDimension = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.dateDimension as any,
    renderingContext,
  },
};

export const RelativeDateDimension = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.relativeDateDimension as any,
    renderingContext,
  },
};

export const ShowPercentagesBoth = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.showPercentagesBoth as any,
    renderingContext,
  },
};

export const NullDimension = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.nullDimension as any,
    renderingContext,
  },
};

export const NumDecimalPlacesChart = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.numDecimalPlacesChart as any,
    renderingContext,
  },
};

export const NumDecimalPlacesLegend = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.numDecimalPlacesLegend as any,
    renderingContext,
  },
};

export const TruncatedTotal = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.truncatedTotal as any,
    renderingContext,
  },
};

export const UnaggregatedDimension = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.unaggregatedDimension as any,
    renderingContext,
  },
};

export const SingleDimension = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.singleDimension as any,
    renderingContext,
  },
};

export const LongDimensionName = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.longDimensionName as any,
    renderingContext,
  },
};

export const TinySlicesDisappear43766 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.tinySlicesDisappear43766 as any,
    renderingContext,
  },
};

export const MissingCurrencyFormatting44086 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.missingCurrencyFormatting44086 as any,
    renderingContext,
  },
};

export const MissingCurrencyFormatting2 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.missingCurrencyFormatting2 as any,
    renderingContext,
  },
};

export const MissingCurrencyFormatting3 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.missingCurrencyFormatting3 as any,
    renderingContext,
  },
};

export const MissingColors44087 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.missingColors44087 as any,
    renderingContext,
  },
};

export const InvalidDimensionSetting44085 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.invalidDimensionSetting44085 as any,
    renderingContext,
  },
};

export const PercentagesOnChartBooleanDimensionCrashes44085 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.percentagesOnChartBooleanDimensionCrashes44085 as any,
    renderingContext,
  },
};

export const AllZeroMetric44847 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.allZeroMetric44847 as any,
    renderingContext,
  },
};

export const NoSingleColumnLegend45149 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.noSingleColumnLegend45149 as any,
    renderingContext,
  },
};

export const NumericSQLColumnCrashes28568 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.numericSQLColumnCrashes28568 as any,
    renderingContext,
  },
};

export const MissingLabelLargeSlice38424 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.missingLabelLargeSlice38424 as any,
    renderingContext,
  },
};

export const TwoRings = Template.bind({});
TwoRings.args = {
  // Unjustified type cast. FIXME
  rawSeries: data.twoRings as any,
  renderingContext,
};

export const ThreeRings = Template.bind({});
ThreeRings.args = {
  // Unjustified type cast. FIXME
  rawSeries: data.threeRings as any,
  renderingContext,
};

export const ThreeRingsNoLabels = Template.bind({});
ThreeRingsNoLabels.args = {
  // Unjustified type cast. FIXME
  rawSeries: data.threeRingsNoLabels as any,
  renderingContext,
};

export const ThreeRingsPercentagesAndLabels = Template.bind({});
ThreeRingsPercentagesAndLabels.args = {
  // Unjustified type cast. FIXME
  rawSeries: data.threeRingsPercentagesAndLabels as any,
  renderingContext,
};

export const ThreeRingsPercentagesOnChart = Template.bind({});
ThreeRingsPercentagesOnChart.args = {
  // Unjustified type cast. FIXME
  rawSeries: data.threeRingsPercentagesOnChart as any,
  renderingContext,
};

export const ThreeRingsOtherSlices = Template.bind({});
ThreeRingsOtherSlices.args = {
  // Unjustified type cast. FIXME
  rawSeries: data.threeRingsOtherSlices as any,
  renderingContext,
};

export const LabelsWithPercent = Template.bind({});
LabelsWithPercent.args = {
  // Unjustified type cast. FIXME
  rawSeries: data.labelsWithPercent as any,
  renderingContext,
};

export const LabelsOnChart = Template.bind({});
LabelsOnChart.args = {
  // Unjustified type cast. FIXME
  rawSeries: data.labelsOnChart as any,
  renderingContext,
};

export const SunburstOtherLabel = Template.bind({});
SunburstOtherLabel.args = {
  // Unjustified type cast. FIXME
  rawSeries: data.sunburstOtherLabel as any,
  renderingContext,
};

export const Watermark = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.allSettings as any,
    renderingContext,
    hasDevWatermark: true,
  },
};
