import type { ComponentStory } from "@storybook/react";

import { color } from "metabase/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import { ComboChart } from "./ComboChart";
import { data } from "./stories-data";

export default {
  title: "static-viz/ComboChart",
  component: ComboChart,
};

const Template: ComponentStory<typeof ComboChart> = args => {
  return (
    <div style={{ border: "1px solid black", display: "inline-block" }}>
      <ComboChart {...args} isStorybook />
    </div>
  );
};

const renderingContext: RenderingContext = {
  getColor: color,
  formatValue: formatStaticValue as any,
  measureText: (text, style) =>
    measureTextWidth(text, Number(style.size), Number(style.weight)),
  measureTextHeight: (_, style) => measureTextHeight(Number(style.size)),
  fontFamily: "Lato",
  theme: DEFAULT_VISUALIZATION_THEME,
};

export const LineLinearXScale = Template.bind({});
LineLinearXScale.args = {
  rawSeries: data.lineLinearXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineLinearXScaleUnsorted = Template.bind({});
LineLinearXScaleUnsorted.args = {
  rawSeries: data.lineLinearXScaleUnsorted as any,
  dashcardSettings: {},
  renderingContext,
};

export const LogYScaleCustomYAxisRange = Template.bind({});
LogYScaleCustomYAxisRange.args = {
  rawSeries: data.logYScaleCustomYAxisRange as any,
  dashcardSettings: {},
  renderingContext,
};

export const PowYScaleCustomYAxisRange = Template.bind({});
PowYScaleCustomYAxisRange.args = {
  rawSeries: data.powYScaleCustomYAxisRange as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineLogYScale = Template.bind({});
LineLogYScale.args = {
  rawSeries: data.lineLogYScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalLineLogYScale = Template.bind({});
GoalLineLogYScale.args = {
  rawSeries: data.goalLineLogYScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalLinePowYScale = Template.bind({});
GoalLinePowYScale.args = {
  rawSeries: data.goalLinePowYScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineLogYScaleNegative = Template.bind({});
LineLogYScaleNegative.args = {
  rawSeries: data.lineLogYScaleNegative as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineShowDotsAuto = Template.bind({});
LineShowDotsAuto.args = {
  rawSeries: data.lineShowDotsAuto as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineShowDotsOn = Template.bind({});
LineShowDotsOn.args = {
  rawSeries: data.lineShowDotsOn as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineShowDotsOff = Template.bind({});
LineShowDotsOff.args = {
  rawSeries: data.lineShowDotsOff as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineCustomYAxisRangeEqualsExtents = Template.bind({});
LineCustomYAxisRangeEqualsExtents.args = {
  rawSeries: data.lineCustomYAxisRangeEqualsExtents as any,
  dashcardSettings: {},
  renderingContext,
};

export const CustomYAxisRangeWithColumnScaling = Template.bind({});
CustomYAxisRangeWithColumnScaling.args = {
  rawSeries: data.customYAxisRangeWithColumnScaling as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineFullyNullDimension37902 = Template.bind({});
LineFullyNullDimension37902.args = {
  rawSeries: data.lineFullyNullDimension37902 as any,
  dashcardSettings: {},
  renderingContext,
};

export const AreaFullyNullDimension37902 = Template.bind({});
AreaFullyNullDimension37902.args = {
  rawSeries: data.areaFullyNullDimension37902 as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarLinearXScale = Template.bind({});
BarLinearXScale.args = {
  rawSeries: data.barLinearXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarHistogramXScale = Template.bind({});
BarHistogramXScale.args = {
  rawSeries: data.barHistogramXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarHistogramMultiSeries = Template.bind({});
BarHistogramMultiSeries.args = {
  rawSeries: data.barHistogramMultiSeries as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarHistogramMultiSeriesBinned = Template.bind({});
BarHistogramMultiSeriesBinned.args = {
  rawSeries: data.barHistogramMultiSeriesBinned as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarHistogramSeriesBreakout = Template.bind({});
BarHistogramSeriesBreakout.args = {
  rawSeries: data.barHistogramSeriesBreakout as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarHistogramStacked = Template.bind({});
BarHistogramStacked.args = {
  rawSeries: data.barHistogramStacked as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarHistogramStackedNormalized = Template.bind({});
BarHistogramStackedNormalized.args = {
  rawSeries: data.barHistogramStackedNormalized as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarHistogramUnaggregatedDimension = Template.bind({});
BarHistogramUnaggregatedDimension.args = {
  rawSeries: data.barHistogramUnaggregatedDimension as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarOrdinalXScale = Template.bind({});
BarOrdinalXScale.args = {
  rawSeries: data.barOrdinalXScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarOrdinalXScaleAutoRotatedLabels = Template.bind({});
BarOrdinalXScaleAutoRotatedLabels.args = {
  rawSeries: data.barOrdinalXScaleAutoRotatedLabels as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedTotalFormattedValues = Template.bind({});
BarStackedTotalFormattedValues.args = {
  rawSeries: data.barStackedTotalFormattedValues as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedPowYAxis = Template.bind({});
BarStackedPowYAxis.args = {
  rawSeries: data.barStackedPowYAxis as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedPowYAxisNegatives = Template.bind({});
BarStackedPowYAxisNegatives.args = {
  rawSeries: data.barStackedPowYAxisNegatives as any,
  dashcardSettings: {},
  renderingContext,
};

export const YAxisCompactWithoutDataLabels = Template.bind({});
YAxisCompactWithoutDataLabels.args = {
  rawSeries: data.yAxisCompactWithoutDataLabels as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarFormattingFull = Template.bind({});
BarFormattingFull.args = {
  rawSeries: data.barFormattingFull as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarAutoFormattingCompact = Template.bind({});
BarAutoFormattingCompact.args = {
  rawSeries: data.barAutoFormattingCompact as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarAutoFormattingFull = Template.bind({});
BarAutoFormattingFull.args = {
  rawSeries: data.barAutoFormattingFull as any,
  dashcardSettings: {},
  renderingContext,
  getColor: color,
} as any;

export const BarLogYScaleStacked = Template.bind({});
BarLogYScaleStacked.args = {
  rawSeries: data.barLogYScaleStacked as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarLogYScaleStackedNegative = Template.bind({});
BarLogYScaleStackedNegative.args = {
  rawSeries: data.barLogYScaleStackedNegative as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedNormalizedEmptySpace37880 = Template.bind({});
BarStackedNormalizedEmptySpace37880.args = {
  rawSeries: data.barStackedNormalizedEmptySpace37880 as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarTwoAxesStackedWithNegativeValues = Template.bind({});
BarTwoAxesStackedWithNegativeValues.args = {
  rawSeries: data.barTwoAxesStackedWithNegativeValues as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarBreakoutWithLineSeriesStackedRightAxisOnly = Template.bind({});
BarBreakoutWithLineSeriesStackedRightAxisOnly.args = {
  rawSeries: data.barBreakoutWithLineSeriesStackedRightAxisOnly as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarsBreakoutSortedWithNegativeValuesPowerYAxis = Template.bind({});
BarsBreakoutSortedWithNegativeValuesPowerYAxis.args = {
  rawSeries: data.barsBreakoutSortedWithNegativeValuesPowerYAxis as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarFullyNullDimension37902 = Template.bind({});
BarFullyNullDimension37902.args = {
  rawSeries: data.barFullyNullDimension37902 as any,
  dashcardSettings: {},
  renderingContext,
};

export const SplitYAxis = Template.bind({});
SplitYAxis.args = {
  rawSeries: data.autoYSplit as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalLineOutOfBounds37848 = Template.bind({});
GoalLineOutOfBounds37848.args = {
  rawSeries: data.goalLineOutOfBounds37848 as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalLineUnderSeries38824 = Template.bind({});
GoalLineUnderSeries38824.args = {
  rawSeries: data.goalLineUnderSeries38824 as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalVerySmall = Template.bind({});
GoalVerySmall.args = {
  rawSeries: data.goalVerySmall as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalBetweenExtentAndChartBound = Template.bind({});
GoalBetweenExtentAndChartBound.args = {
  rawSeries: data.goalBetweenExtentAndChartBound as any,
  dashcardSettings: {},
  renderingContext,
};

export const GoalLineDisabled = Template.bind({});
GoalLineDisabled.args = {
  rawSeries: data.goalLineDisabled as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendSingleSeriesLine = Template.bind({});
TrendSingleSeriesLine.args = {
  rawSeries: data.trendSingleSeriesLine as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesLine = Template.bind({});
TrendMultiSeriesLine.args = {
  rawSeries: data.trendMultiSeriesLine as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendSingleSeriesArea = Template.bind({});
TrendSingleSeriesArea.args = {
  rawSeries: data.trendSingleSeriesArea as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesArea = Template.bind({});
TrendMultiSeriesArea.args = {
  rawSeries: data.trendMultiSeriesArea as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesStackedArea = Template.bind({});
TrendMultiSeriesStackedArea.args = {
  rawSeries: data.trendMultiSeriesStackedArea as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesNormalizedStackedArea = Template.bind({});
TrendMultiSeriesNormalizedStackedArea.args = {
  rawSeries: data.trendMultiSeriesNormalizedStackedArea as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendSingleSeriesBar = Template.bind({});
TrendSingleSeriesBar.args = {
  rawSeries: data.trendSingleSeriesBar as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesBar = Template.bind({});
TrendMultiSeriesBar.args = {
  rawSeries: data.trendMultiSeriesBar as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesStackedBar = Template.bind({});
TrendMultiSeriesStackedBar.args = {
  rawSeries: data.trendMultiSeriesStackedBar as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendMultiSeriesNormalizedStackedBar = Template.bind({});
TrendMultiSeriesNormalizedStackedBar.args = {
  rawSeries: data.trendMultiSeriesNormalizedStackedBar as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendCombo = Template.bind({});
TrendCombo.args = {
  rawSeries: data.trendCombo as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendComboPower = Template.bind({});
TrendComboPower.args = {
  rawSeries: data.trendComboPower as any,
  dashcardSettings: {},
  renderingContext,
};

export const TrendComboLog = Template.bind({});
TrendComboLog.args = {
  rawSeries: data.trendComboLog as any,
  dashcardSettings: {},
  renderingContext,
};

export const ComboHistogram = Template.bind({});
ComboHistogram.args = {
  rawSeries: data.comboHistogram as any,
  dashcardSettings: {},
  renderingContext,
};

export const CombinedBarTimeSeriesDifferentGranularityWithBreakout =
  Template.bind({});
CombinedBarTimeSeriesDifferentGranularityWithBreakout.args = {
  rawSeries: data.combinedBarTimeSeriesDifferentGranularityWithBreakout as any,
  dashcardSettings: {},
  renderingContext,
};

export const NumericXAxisIncludesZero37082 = Template.bind({});
NumericXAxisIncludesZero37082.args = {
  rawSeries: data.numericXAxisIncludesZero37082 as any,
  dashcardSettings: {},
  renderingContext,
};

export const WrongYAxisRange37306 = Template.bind({});
WrongYAxisRange37306.args = {
  rawSeries: data.wrongYAxisRange37306 as any,
  dashcardSettings: {},
  renderingContext,
};

export const LongDimensionNameCutOff37420 = Template.bind({});
LongDimensionNameCutOff37420.args = {
  rawSeries: data.longDimensionNameCutOff37420 as any,
  dashcardSettings: {},
  renderingContext,
};

export const CompactXAxisDoesNotWork38917 = Template.bind({});
CompactXAxisDoesNotWork38917.args = {
  rawSeries: data.compactXAxisDoesNotWork38917 as any,
  dashcardSettings: {},
  renderingContext,
};

export const DataLabelsUnderTrendGoalLines41280 = Template.bind({});
DataLabelsUnderTrendGoalLines41280.args = {
  rawSeries: data.dataLabelsUnderTrendGoalLines41280 as any,
  dashcardSettings: {},
  renderingContext,
};
export const TicksNativeWeekWithGapShortRange = Template.bind({});
TicksNativeWeekWithGapShortRange.args = {
  rawSeries: data.ticksNativeWeekWithGapShortRange as any,
  dashcardSettings: {},
  renderingContext,
};

export const TicksNativeWeekWithGapLongRange = Template.bind({});
TicksNativeWeekWithGapLongRange.args = {
  rawSeries: data.ticksNativeWeekWithGapLongRange as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackLinearXAxis = Template.bind({});
BarStackLinearXAxis.args = {
  rawSeries: data.barStackLinearXAxis as any,
  dashcardSettings: {},
  renderingContext,
};

export const AreaStackLinearXAxis = Template.bind({});
AreaStackLinearXAxis.args = {
  rawSeries: data.areaStackLinearXAxis as any,
  dashcardSettings: {},
  renderingContext,
};

export const NullCategoryValueFormatting = Template.bind({});
NullCategoryValueFormatting.args = {
  rawSeries: data.nullCategoryValueFormatting as any,
  dashcardSettings: {},
  renderingContext,
};

export const NumberOfInsightsError39608 = Template.bind({});
NumberOfInsightsError39608.args = {
  rawSeries: data.numberOfInsightsError39608 as any,
  dashcardSettings: {},
  renderingContext,
};

export const AreaStackInterpolateMissingValues = Template.bind({});
AreaStackInterpolateMissingValues.args = {
  rawSeries: data.areaStackInterpolateMissingValues as any,
  dashcardSettings: {},
  renderingContext,
};

export const AreaStackAllSeriesWithoutInterpolation = Template.bind({});
AreaStackAllSeriesWithoutInterpolation.args = {
  rawSeries: data.areaStackAllSeriesWithoutInterpolation as any,
  dashcardSettings: {},
  renderingContext,
};

export const AreaOverBar = Template.bind({});
AreaOverBar.args = {
  rawSeries: data.areaOverBar as any,
  dashcardSettings: {},
  renderingContext,
};

export const TimeSeriesTicksCompactFormattingMixedTimezones = Template.bind({});
TimeSeriesTicksCompactFormattingMixedTimezones.args = {
  rawSeries: data.timeSeriesTicksCompactFormattingMixedTimezones as any,
  dashcardSettings: {},
  renderingContext,
};

export const TimezoneTicksPlacement = Template.bind({});
TimezoneTicksPlacement.args = {
  rawSeries: data.timezoneTicksPlacement as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarRelativeDatetimeOrdinalScale = Template.bind({});
BarRelativeDatetimeOrdinalScale.args = {
  rawSeries: data.barRelativeDatetimeOrdinalScale as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarTwoDaysOfWeek = Template.bind({});
BarTwoDaysOfWeek.args = {
  rawSeries: data.barTwoDaysOfWeek as any,
  dashcardSettings: {},
  renderingContext,
};

export const AreaStackedAutoDataLabels = Template.bind({});
AreaStackedAutoDataLabels.args = {
  rawSeries: data.areaStackedAutoDataLabels as any,
  dashcardSettings: {},
  renderingContext,
};

export const ImageCutOff37275 = Template.bind({});
ImageCutOff37275.args = {
  rawSeries: data.imageCutOff37275 as any,
  dashcardSettings: {},
  renderingContext,
};

export const IncorrectLabelYAxisSplit41285 = Template.bind({});
IncorrectLabelYAxisSplit41285.args = {
  rawSeries: data.incorrectLabelYAxisSplit41285 as any,
  dashcardSettings: {},
  renderingContext,
};

export const NativeAutoYSplit = Template.bind({});
NativeAutoYSplit.args = {
  rawSeries: data.nativeAutoYSplit as any,
  dashcardSettings: {},
  renderingContext,
};

export const TimeSeriesYyyymmddNumbersFormat = Template.bind({});
TimeSeriesYyyymmddNumbersFormat.args = {
  rawSeries: data.timeSeriesYyyymmddNumbersFormat as any,
  dashcardSettings: {},
  renderingContext,
};

export const BreakoutNullAndEmptyString = Template.bind({});
BreakoutNullAndEmptyString.args = {
  rawSeries: data.breakoutNullAndEmptyString as any,
  dashcardSettings: {},
  renderingContext,
};

export const NoGoodAxisSplit = Template.bind({});
NoGoodAxisSplit.args = {
  rawSeries: data.noGoodAxisSplit as any,
  dashcardSettings: {},
  renderingContext,
};

export const HistogramTicks45Degrees = Template.bind({});
HistogramTicks45Degrees.args = {
  rawSeries: data.histogramTicks45Degrees as any,
  dashcardSettings: {},
  renderingContext,
};

export const HistogramTicks90Degrees = Template.bind({});
HistogramTicks90Degrees.args = {
  rawSeries: data.histogramTicks90Degrees as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineUnpinFromZero = Template.bind({});
LineUnpinFromZero.args = {
  rawSeries: data.lineUnpinFromZero as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineSettings = Template.bind({});
LineSettings.args = {
  rawSeries: data.lineSettings as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineReplaceMissingValuesZero = Template.bind({});
LineReplaceMissingValuesZero.args = {
  rawSeries: data.lineReplaceMissingValuesZero as any,
  dashcardSettings: {},
  renderingContext,
};

export const LineChartBrokenDimensionsMetricsSettings = Template.bind({});
LineChartBrokenDimensionsMetricsSettings.args = {
  rawSeries: data.lineChartBrokenDimensionsMetricsSettings as any,
  dashcardSettings: {},
  renderingContext,
};

export const ComboStackedBarsAreasNormalized = Template.bind({});
ComboStackedBarsAreasNormalized.args = {
  rawSeries: data.comboStackedBarsAreasNormalized as any,
  dashcardSettings: {},
  renderingContext,
};

export const ComboStackedBarsAreas = Template.bind({});
ComboStackedBarsAreas.args = {
  rawSeries: data.comboStackedBarsAreas as any,
  dashcardSettings: {},
  renderingContext,
};

export const TwoBarsTwoAreasOneLineLinear = Template.bind({});
TwoBarsTwoAreasOneLineLinear.args = {
  rawSeries: data.twoBarsTwoAreasOneLineLinear as any,
  dashcardSettings: {},
  renderingContext,
};

export const TwoBarsTwoAreasOneLinePower = Template.bind({});
TwoBarsTwoAreasOneLinePower.args = {
  rawSeries: data.twoBarsTwoAreasOneLinePower as any,
  dashcardSettings: {},
  renderingContext,
};

export const TwoBarsTwoAreasOneLineLog = Template.bind({});
TwoBarsTwoAreasOneLineLog.args = {
  rawSeries: data.twoBarsTwoAreasOneLineLog as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarCorrectWidthWhenTwoYAxes = Template.bind({});
BarCorrectWidthWhenTwoYAxes.args = {
  rawSeries: data.barCorrectWidthWhenTwoYAxes as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarDataLabelsNegatives = Template.bind({});
BarDataLabelsNegatives.args = {
  rawSeries: data.barDataLabelsNegatives as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedNormalizedSeriesLabels = Template.bind({});
BarStackedNormalizedSeriesLabels.args = {
  rawSeries: data.barStackedNormalizedSeriesLabels as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedSeriesLabelsAndTotals = Template.bind({});
BarStackedSeriesLabelsAndTotals.args = {
  rawSeries: data.barStackedSeriesLabelsAndTotals as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedSeriesLabelsNoTotals = Template.bind({});
BarStackedSeriesLabelsNoTotals.args = {
  rawSeries: data.barStackedSeriesLabelsNoTotals as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedSeriesLabelsRotated = Template.bind({});
BarStackedSeriesLabelsRotated.args = {
  rawSeries: data.barStackedSeriesLabelsRotated as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedSeriesLabelsAutoCompactness = Template.bind({});
BarStackedSeriesLabelsAutoCompactness.args = {
  rawSeries: data.barStackedSeriesLabelsAutoCompactness as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedSeriesLabelsAndTotalsOrdinal = Template.bind({});
BarStackedSeriesLabelsAndTotalsOrdinal.args = {
  rawSeries: data.barStackedSeriesLabelsAndTotalsOrdinal as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedSeriesLabelsNormalizedAutoCompactness = Template.bind(
  {},
);
BarStackedSeriesLabelsNormalizedAutoCompactness.args = {
  rawSeries: data.barStackedSeriesLabelsNormalizedAutoCompactness as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarStackedLabelsNullVsZero = Template.bind({});
BarStackedLabelsNullVsZero.args = {
  rawSeries: data.barStackedLabelsNullVsZero as any,
  dashcardSettings: {},
  renderingContext,
};

export const BarMinHeightLimit = Template.bind({});
BarMinHeightLimit.args = {
  rawSeries: data.barMinHeightLimit as any,
  dashcardSettings: {},
  renderingContext,
};

export const ComboDataLabelsAutoCompactnessPropagatesFromLine = Template.bind(
  {},
);
ComboDataLabelsAutoCompactnessPropagatesFromLine.args = {
  rawSeries: data.comboDataLabelsAutoCompactnessPropagatesFromLine as any,
  dashcardSettings: {},
  renderingContext,
};

export const ComboDataLabelsAutoCompactnessPropagatesFromTotals = Template.bind(
  {},
);
ComboDataLabelsAutoCompactnessPropagatesFromTotals.args = {
  rawSeries: data.comboDataLabelsAutoCompactnessPropagatesFromTotals as any,
  dashcardSettings: {},
  renderingContext,
};

export const AreaChartSteppedNullsInterpolated = Template.bind({});
AreaChartSteppedNullsInterpolated.args = {
  rawSeries: data.areaChartSteppedNullsInterpolated as any,
  dashcardSettings: {},
  renderingContext,
};

export const AreaChartSteppedNullsSkipped = Template.bind({});
AreaChartSteppedNullsSkipped.args = {
  rawSeries: data.areaChartSteppedNullsSkipped as any,
  dashcardSettings: {},
  renderingContext,
};

export const SafariNonIanaTimezoneRepro44128 = Template.bind({});
SafariNonIanaTimezoneRepro44128.args = {
  rawSeries: data.safariNonIanaTimezoneRepro44128 as any,
  dashcardSettings: {},
  renderingContext,
};

export const CombinedWithInvalidSettings = Template.bind({});
CombinedWithInvalidSettings.args = {
  rawSeries: data.combinedWithInvalidSettings as any,
  dashcardSettings: {},
  renderingContext,
};

export const StackedChartCustomYAxisRange = Template.bind({});
StackedChartCustomYAxisRange.args = {
  rawSeries: data.stackedChartCustomYAxisRange as any,
  dashcardSettings: {},
  renderingContext,
};

export const SeriesOrderSettingsDoNotMatchSeriesCount = Template.bind({});
SeriesOrderSettingsDoNotMatchSeriesCount.args = {
  rawSeries: data.seriesOrderSettingsDoNotMatchSeriesCount as any,
  dashcardSettings: {},
  renderingContext,
};

export const Default = Template.bind({});
Default.args = {
  rawSeries: data.messedUpAxis as any,
  dashcardSettings: {},
  renderingContext,
};
