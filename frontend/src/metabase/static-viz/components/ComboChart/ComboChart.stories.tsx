import type { ComponentStory } from "@storybook/react";

import { IsomorphicVisualizationStory } from "__support__/storybook";
import { registerVisualization } from "metabase/visualizations";
import { AreaChart } from "metabase/visualizations/visualizations/AreaChart";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import { ComboChart } from "metabase/visualizations/visualizations/ComboChart";
import { LineChart } from "metabase/visualizations/visualizations/LineChart";

import { data } from "./stories-data";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(LineChart);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(BarChart);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(AreaChart);
// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(ComboChart);

export default {
  title: "static-viz/ComboChart",
  component: IsomorphicVisualizationStory,
};

const Template: ComponentStory<typeof IsomorphicVisualizationStory> = args => {
  return <IsomorphicVisualizationStory {...args} />;
};

export const LineLinearXScale = Template.bind({});
LineLinearXScale.args = {
  rawSeries: data.lineLinearXScale,
};

export const LineLinearXScaleUnsorted = Template.bind({});
LineLinearXScaleUnsorted.args = {
  rawSeries: data.lineLinearXScaleUnsorted,
};

export const LogYScaleCustomYAxisRange = Template.bind({});
LogYScaleCustomYAxisRange.args = {
  rawSeries: data.logYScaleCustomYAxisRange,
};

export const PowYScaleCustomYAxisRange = Template.bind({});
PowYScaleCustomYAxisRange.args = {
  rawSeries: data.powYScaleCustomYAxisRange,
};

export const LineLogYScale = Template.bind({});
LineLogYScale.args = {
  rawSeries: data.lineLogYScale,
};

export const LineLogYScaleNegative = Template.bind({});
LineLogYScaleNegative.args = {
  rawSeries: data.lineLogYScaleNegative,
};

export const LineShowDotsAuto = Template.bind({});
LineShowDotsAuto.args = {
  rawSeries: data.lineShowDotsAuto,
};

export const LineShowDotsOn = Template.bind({});
LineShowDotsOn.args = {
  rawSeries: data.lineShowDotsOn,
};

export const LineShowDotsOff = Template.bind({});
LineShowDotsOff.args = {
  rawSeries: data.lineShowDotsOff,
};

export const LineCustomYAxisRangeEqualsExtents = Template.bind({});
LineCustomYAxisRangeEqualsExtents.args = {
  rawSeries: data.lineCustomYAxisRangeEqualsExtents,
};

export const CustomYAxisRangeWithColumnScaling = Template.bind({});
CustomYAxisRangeWithColumnScaling.args = {
  rawSeries: data.customYAxisRangeWithColumnScaling,
};

export const LineFullyNullDimension37902 = Template.bind({});
LineFullyNullDimension37902.args = {
  rawSeries: data.lineFullyNullDimension37902,
};

export const AreaFullyNullDimension37902 = Template.bind({});
AreaFullyNullDimension37902.args = {
  rawSeries: data.areaFullyNullDimension37902,
};

export const BarLinearXScale = Template.bind({});
BarLinearXScale.args = {
  rawSeries: data.barLinearXScale,
};

export const BarHistogramXScale = Template.bind({});
BarHistogramXScale.args = {
  rawSeries: data.barHistogramXScale,
};

export const BarHistogramMultiSeries = Template.bind({});
BarHistogramMultiSeries.args = {
  rawSeries: data.barHistogramMultiSeries,
};

export const BarHistogramMultiSeriesBinned = Template.bind({});
BarHistogramMultiSeriesBinned.args = {
  rawSeries: data.barHistogramMultiSeriesBinned,
};

export const BarHistogramSeriesBreakout = Template.bind({});
BarHistogramSeriesBreakout.args = {
  rawSeries: data.barHistogramSeriesBreakout,
};

export const BarHistogramStacked = Template.bind({});
BarHistogramStacked.args = {
  rawSeries: data.barHistogramStacked,
};

export const BarHistogramStackedNormalized = Template.bind({});
BarHistogramStackedNormalized.args = {
  rawSeries: data.barHistogramStackedNormalized,
};

export const BarHistogramUnaggregatedDimension = Template.bind({});
BarHistogramUnaggregatedDimension.args = {
  rawSeries: data.barHistogramUnaggregatedDimension,
};

export const BarOrdinalXScale = Template.bind({});
BarOrdinalXScale.args = {
  rawSeries: data.barOrdinalXScale,
};

export const BarOrdinalXScaleAutoRotatedLabels = Template.bind({});
BarOrdinalXScaleAutoRotatedLabels.args = {
  rawSeries: data.barOrdinalXScaleAutoRotatedLabels,
};

export const BarStackedTotalFormattedValues = Template.bind({});
BarStackedTotalFormattedValues.args = {
  rawSeries: data.barStackedTotalFormattedValues,
};

export const BarStackedPowYAxis = Template.bind({});
BarStackedPowYAxis.args = {
  rawSeries: data.barStackedPowYAxis,
};

export const BarStackedPowYAxisNegatives = Template.bind({});
BarStackedPowYAxisNegatives.args = {
  rawSeries: data.barStackedPowYAxisNegatives,
};

export const YAxisCompactWithoutDataLabels = Template.bind({});
YAxisCompactWithoutDataLabels.args = {
  rawSeries: data.yAxisCompactWithoutDataLabels,
};

export const BarFormattingFull = Template.bind({});
BarFormattingFull.args = {
  rawSeries: data.barFormattingFull,
};

export const BarAutoFormattingCompact = Template.bind({});
BarAutoFormattingCompact.args = {
  rawSeries: data.barAutoFormattingCompact,
};

export const BarAutoFormattingFull = Template.bind({});
BarAutoFormattingFull.args = {
  rawSeries: data.barAutoFormattingFull,
};

export const BarLogYScaleStacked = Template.bind({});
BarLogYScaleStacked.args = {
  rawSeries: data.barLogYScaleStacked,
};

export const BarLogYScaleStackedNegative = Template.bind({});
BarLogYScaleStackedNegative.args = {
  rawSeries: data.barLogYScaleStackedNegative,
};

export const BarStackedNormalizedEmptySpace37880 = Template.bind({});
BarStackedNormalizedEmptySpace37880.args = {
  rawSeries: data.barStackedNormalizedEmptySpace37880,
};

export const BarTwoAxesStackedWithNegativeValues = Template.bind({});
BarTwoAxesStackedWithNegativeValues.args = {
  rawSeries: data.barTwoAxesStackedWithNegativeValues,
};

export const BarBreakoutWithLineSeriesStackedRightAxisOnly = Template.bind({});
BarBreakoutWithLineSeriesStackedRightAxisOnly.args = {
  rawSeries: data.barBreakoutWithLineSeriesStackedRightAxisOnly,
};

export const BarsBreakoutSortedWithNegativeValuesPowerYAxis = Template.bind({});
BarsBreakoutSortedWithNegativeValuesPowerYAxis.args = {
  rawSeries: data.barsBreakoutSortedWithNegativeValuesPowerYAxis,
};

export const BarFullyNullDimension37902 = Template.bind({});
BarFullyNullDimension37902.args = {
  rawSeries: data.barFullyNullDimension37902,
};

export const SplitYAxis = Template.bind({});
SplitYAxis.args = {
  rawSeries: data.autoYSplit,
};

export const GoalLineOutOfBounds37848 = Template.bind({});
GoalLineOutOfBounds37848.args = {
  rawSeries: data.goalLineOutOfBounds37848,
};

export const GoalLineUnderSeries38824 = Template.bind({});
GoalLineUnderSeries38824.args = {
  rawSeries: data.goalLineUnderSeries38824,
};

export const GoalVerySmall = Template.bind({});
GoalVerySmall.args = {
  rawSeries: data.goalVerySmall,
};

export const GoalBetweenExtentAndChartBound = Template.bind({});
GoalBetweenExtentAndChartBound.args = {
  rawSeries: data.goalBetweenExtentAndChartBound,
};

export const GoalLineDisabled = Template.bind({});
GoalLineDisabled.args = {
  rawSeries: data.goalLineDisabled,
};

export const TrendSingleSeriesLine = Template.bind({});
TrendSingleSeriesLine.args = {
  rawSeries: data.trendSingleSeriesLine,
};

export const TrendMultiSeriesLine = Template.bind({});
TrendMultiSeriesLine.args = {
  rawSeries: data.trendMultiSeriesLine,
};

export const TrendSingleSeriesArea = Template.bind({});
TrendSingleSeriesArea.args = {
  rawSeries: data.trendSingleSeriesArea,
};

export const TrendMultiSeriesArea = Template.bind({});
TrendMultiSeriesArea.args = {
  rawSeries: data.trendMultiSeriesArea,
};

export const TrendMultiSeriesStackedArea = Template.bind({});
TrendMultiSeriesStackedArea.args = {
  rawSeries: data.trendMultiSeriesStackedArea,
};

export const TrendMultiSeriesNormalizedStackedArea = Template.bind({});
TrendMultiSeriesNormalizedStackedArea.args = {
  rawSeries: data.trendMultiSeriesNormalizedStackedArea,
};

export const TrendSingleSeriesBar = Template.bind({});
TrendSingleSeriesBar.args = {
  rawSeries: data.trendSingleSeriesBar,
};

export const TrendMultiSeriesBar = Template.bind({});
TrendMultiSeriesBar.args = {
  rawSeries: data.trendMultiSeriesBar,
};

export const TrendMultiSeriesStackedBar = Template.bind({});
TrendMultiSeriesStackedBar.args = {
  rawSeries: data.trendMultiSeriesStackedBar,
};

export const TrendMultiSeriesNormalizedStackedBar = Template.bind({});
TrendMultiSeriesNormalizedStackedBar.args = {
  rawSeries: data.trendMultiSeriesNormalizedStackedBar,
};

export const TrendCombo = Template.bind({});
TrendCombo.args = {
  rawSeries: data.trendCombo,
};

export const TrendComboPower = Template.bind({});
TrendComboPower.args = {
  rawSeries: data.trendComboPower,
};

export const TrendComboLog = Template.bind({});
TrendComboLog.args = {
  rawSeries: data.trendComboLog,
};

export const ComboHistogram = Template.bind({});
ComboHistogram.args = {
  rawSeries: data.comboHistogram,
};

export const CombinedBarTimeSeriesDifferentGranularityWithBreakout =
  Template.bind({});
CombinedBarTimeSeriesDifferentGranularityWithBreakout.args = {
  rawSeries: data.combinedBarTimeSeriesDifferentGranularityWithBreakout,
};

export const NumericXAxisIncludesZero37082 = Template.bind({});
NumericXAxisIncludesZero37082.args = {
  rawSeries: data.numericXAxisIncludesZero37082,
};

export const WrongYAxisRange37306 = Template.bind({});
WrongYAxisRange37306.args = {
  rawSeries: data.wrongYAxisRange37306,
};

export const LongDimensionNameCutOff37420 = Template.bind({});
LongDimensionNameCutOff37420.args = {
  rawSeries: data.longDimensionNameCutOff37420,
};

export const CompactXAxisDoesNotWork38917 = Template.bind({});
CompactXAxisDoesNotWork38917.args = {
  rawSeries: data.compactXAxisDoesNotWork38917,
};

export const DataLabelsUnderTrendGoalLines41280 = Template.bind({});
DataLabelsUnderTrendGoalLines41280.args = {
  rawSeries: data.dataLabelsUnderTrendGoalLines41280,
};
export const TicksNativeWeekWithGapShortRange = Template.bind({});
TicksNativeWeekWithGapShortRange.args = {
  rawSeries: data.ticksNativeWeekWithGapShortRange,
};

export const TicksNativeWeekWithGapLongRange = Template.bind({});
TicksNativeWeekWithGapLongRange.args = {
  rawSeries: data.ticksNativeWeekWithGapLongRange,
};

export const BarStackLinearXAxis = Template.bind({});
BarStackLinearXAxis.args = {
  rawSeries: data.barStackLinearXAxis,
};

export const AreaStackLinearXAxis = Template.bind({});
AreaStackLinearXAxis.args = {
  rawSeries: data.areaStackLinearXAxis,
};

export const NullCategoryValueFormatting = Template.bind({});
NullCategoryValueFormatting.args = {
  rawSeries: data.nullCategoryValueFormatting,
};

export const NumberOfInsightsError39608 = Template.bind({});
NumberOfInsightsError39608.args = {
  rawSeries: data.numberOfInsightsError39608,
};

export const AreaStackInterpolateMissingValues = Template.bind({});
AreaStackInterpolateMissingValues.args = {
  rawSeries: data.areaStackInterpolateMissingValues,
};

export const AreaStackAllSeriesWithoutInterpolation = Template.bind({});
AreaStackAllSeriesWithoutInterpolation.args = {
  rawSeries: data.areaStackAllSeriesWithoutInterpolation,
};

export const AreaOverBar = Template.bind({});
AreaOverBar.args = {
  rawSeries: data.areaOverBar,
};

export const TimeSeriesTicksCompactFormattingMixedTimezones = Template.bind({});
TimeSeriesTicksCompactFormattingMixedTimezones.args = {
  rawSeries: data.timeSeriesTicksCompactFormattingMixedTimezones,
};

export const TimezoneTicksPlacement = Template.bind({});
TimezoneTicksPlacement.args = {
  rawSeries: data.timezoneTicksPlacement,
};

export const BarRelativeDatetimeOrdinalScale = Template.bind({});
BarRelativeDatetimeOrdinalScale.args = {
  rawSeries: data.barRelativeDatetimeOrdinalScale,
};

export const BarTwoDaysOfWeek = Template.bind({});
BarTwoDaysOfWeek.args = {
  rawSeries: data.barTwoDaysOfWeek,
};

export const AreaStackedAutoDataLabels = Template.bind({});
AreaStackedAutoDataLabels.args = {
  rawSeries: data.areaStackedAutoDataLabels,
};

export const ImageCutOff37275 = Template.bind({});
ImageCutOff37275.args = {
  rawSeries: data.imageCutOff37275,
};

export const IncorrectLabelYAxisSplit41285 = Template.bind({});
IncorrectLabelYAxisSplit41285.args = {
  rawSeries: data.incorrectLabelYAxisSplit41285,
};

export const NativeAutoYSplit = Template.bind({});
NativeAutoYSplit.args = {
  rawSeries: data.nativeAutoYSplit,
};

export const TimeSeriesYyyymmddNumbersFormat = Template.bind({});
TimeSeriesYyyymmddNumbersFormat.args = {
  rawSeries: data.timeSeriesYyyymmddNumbersFormat,
};

export const BreakoutNullAndEmptyString = Template.bind({});
BreakoutNullAndEmptyString.args = {
  rawSeries: data.breakoutNullAndEmptyString,
};

export const NoGoodAxisSplit = Template.bind({});
NoGoodAxisSplit.args = {
  rawSeries: data.noGoodAxisSplit,
};

export const HistogramTicks45Degrees = Template.bind({});
HistogramTicks45Degrees.args = {
  rawSeries: data.histogramTicks45Degrees,
};

export const HistogramTicks90Degrees = Template.bind({});
HistogramTicks90Degrees.args = {
  rawSeries: data.histogramTicks90Degrees,
};

export const LineUnpinFromZero = Template.bind({});
LineUnpinFromZero.args = {
  rawSeries: data.lineUnpinFromZero,
};

export const LineSettings = Template.bind({});
LineSettings.args = {
  rawSeries: data.lineSettings,
};

export const LineReplaceMissingValuesZero = Template.bind({});
LineReplaceMissingValuesZero.args = {
  rawSeries: data.lineReplaceMissingValuesZero,
};

export const LineChartBrokenDimensionsMetricsSettings = Template.bind({});
LineChartBrokenDimensionsMetricsSettings.args = {
  rawSeries: data.lineChartBrokenDimensionsMetricsSettings,
};

export const ComboStackedBarsAreasNormalized = Template.bind({});
ComboStackedBarsAreasNormalized.args = {
  rawSeries: data.comboStackedBarsAreasNormalized,
};

export const ComboStackedBarsAreas = Template.bind({});
ComboStackedBarsAreas.args = {
  rawSeries: data.comboStackedBarsAreas,
};

export const TwoBarsTwoAreasOneLineLinear = Template.bind({});
TwoBarsTwoAreasOneLineLinear.args = {
  rawSeries: data.twoBarsTwoAreasOneLineLinear,
};

export const TwoBarsTwoAreasOneLinePower = Template.bind({});
TwoBarsTwoAreasOneLinePower.args = {
  rawSeries: data.twoBarsTwoAreasOneLinePower,
};

export const TwoBarsTwoAreasOneLineLog = Template.bind({});
TwoBarsTwoAreasOneLineLog.args = {
  rawSeries: data.twoBarsTwoAreasOneLineLog,
};

export const BarCorrectWidthWhenTwoYAxes = Template.bind({});
BarCorrectWidthWhenTwoYAxes.args = {
  rawSeries: data.barCorrectWidthWhenTwoYAxes,
};

export const BarDataLabelsNegatives = Template.bind({});
BarDataLabelsNegatives.args = {
  rawSeries: data.barDataLabelsNegatives,
};

export const BarStackedNormalizedSeriesLabels = Template.bind({});
BarStackedNormalizedSeriesLabels.args = {
  rawSeries: data.barStackedNormalizedSeriesLabels,
};

export const BarStackedSeriesLabelsAndTotals = Template.bind({});
BarStackedSeriesLabelsAndTotals.args = {
  rawSeries: data.barStackedSeriesLabelsAndTotals,
};

export const BarStackedSeriesLabelsNoTotals = Template.bind({});
BarStackedSeriesLabelsNoTotals.args = {
  rawSeries: data.barStackedSeriesLabelsNoTotals,
};

export const BarStackedSeriesLabelsRotated = Template.bind({});
BarStackedSeriesLabelsRotated.args = {
  rawSeries: data.barStackedSeriesLabelsRotated,
};

export const BarStackedSeriesLabelsAutoCompactness = Template.bind({});
BarStackedSeriesLabelsAutoCompactness.args = {
  rawSeries: data.barStackedSeriesLabelsAutoCompactness,
};

export const BarStackedSeriesLabelsAndTotalsOrdinal = Template.bind({});
BarStackedSeriesLabelsAndTotalsOrdinal.args = {
  rawSeries: data.barStackedSeriesLabelsAndTotalsOrdinal,
};

export const BarStackedSeriesLabelsNormalizedAutoCompactness = Template.bind(
  {},
);
BarStackedSeriesLabelsNormalizedAutoCompactness.args = {
  rawSeries: data.barStackedSeriesLabelsNormalizedAutoCompactness,
};

export const BarStackedLabelsNullVsZero = Template.bind({});
BarStackedLabelsNullVsZero.args = {
  rawSeries: data.barStackedLabelsNullVsZero,
};

export const BarMinHeightLimit = Template.bind({});
BarMinHeightLimit.args = {
  rawSeries: data.barMinHeightLimit,
};

export const ComboDataLabelsAutoCompactnessPropagatesFromLine = Template.bind(
  {},
);
ComboDataLabelsAutoCompactnessPropagatesFromLine.args = {
  rawSeries: data.comboDataLabelsAutoCompactnessPropagatesFromLine,
};

export const ComboDataLabelsAutoCompactnessPropagatesFromTotals = Template.bind(
  {},
);
ComboDataLabelsAutoCompactnessPropagatesFromTotals.args = {
  rawSeries: data.comboDataLabelsAutoCompactnessPropagatesFromTotals,
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: data.messedUpAxis,
};
