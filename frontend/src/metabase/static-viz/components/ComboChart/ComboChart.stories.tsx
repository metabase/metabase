import type { StoryFn } from "@storybook/react";

import { IsomorphicVisualizationStory } from "__support__/storybook";
import { color } from "metabase/lib/colors";

import type { StaticChartProps } from "../StaticVisualization";

import { data } from "./stories-data";

export default {
  title: "static-viz/ComboChart",
  component: IsomorphicVisualizationStory,
};

const Template: StoryFn<StaticChartProps> = args => {
  return <IsomorphicVisualizationStory {...args} />;
};

export const LineLinearXScale = {
  render: Template,
  args: {
    rawSeries: data.lineLinearXScale,
  },
};

export const LineLinearXScaleUnsorted = {
  render: Template,
  args: {
    rawSeries: data.lineLinearXScaleUnsorted,
  },
};

export const LogYScaleCustomYAxisRange = {
  render: Template,
  args: {
    rawSeries: data.logYScaleCustomYAxisRange,
  },
};

export const PowYScaleCustomYAxisRange = {
  render: Template,
  args: {
    rawSeries: data.powYScaleCustomYAxisRange,
  },
};

export const LineLogYScale = {
  render: Template,
  args: {
    rawSeries: data.lineLogYScale,
  },
};

export const GoalLineLogYScale = {
  render: Template,
  args: {
    rawSeries: data.goalLineLogYScale,
  },
};

export const GoalLinePowYScale = {
  render: Template,
  args: {
    rawSeries: data.goalLinePowYScale,
  },
};

export const LineLogYScaleNegative = {
  render: Template,
  args: {
    rawSeries: data.lineLogYScaleNegative,
  },
};

export const LineShowDotsAuto = {
  render: Template,
  args: {
    rawSeries: data.lineShowDotsAuto,
  },
};

export const LineShowDotsOn = {
  render: Template,
  args: {
    rawSeries: data.lineShowDotsOn,
  },
};

export const LineShowDotsOff = {
  render: Template,
  args: {
    rawSeries: data.lineShowDotsOff,
  },
};

export const LineCustomYAxisRangeEqualsExtents = {
  render: Template,
  args: {
    rawSeries: data.lineCustomYAxisRangeEqualsExtents,
  },
};

export const CustomYAxisRangeWithColumnScaling = {
  render: Template,
  args: {
    rawSeries: data.customYAxisRangeWithColumnScaling,
  },
};

export const LineFullyNullDimension37902 = {
  render: Template,
  args: {
    rawSeries: data.lineFullyNullDimension37902,
  },
};

export const AreaFullyNullDimension37902 = {
  render: Template,
  args: {
    rawSeries: data.areaFullyNullDimension37902,
  },
};

export const BarLinearXScale = {
  render: Template,
  args: {
    rawSeries: data.barLinearXScale,
  },
};

export const BarHistogramXScale = {
  render: Template,
  args: {
    rawSeries: data.barHistogramXScale,
  },
};

export const BarHistogramMultiSeries = {
  render: Template,
  args: {
    rawSeries: data.barHistogramMultiSeries,
  },
};

export const BarHistogramMultiSeriesBinned = {
  render: Template,
  args: {
    rawSeries: data.barHistogramMultiSeriesBinned,
  },
};

export const BarHistogramSeriesBreakout = {
  render: Template,
  args: {
    rawSeries: data.barHistogramSeriesBreakout,
  },
};

export const BarHistogramStacked = {
  render: Template,
  args: {
    rawSeries: data.barHistogramStacked,
  },
};

export const BarHistogramStackedNormalized = {
  render: Template,
  args: {
    rawSeries: data.barHistogramStackedNormalized,
  },
};

export const BarHistogramUnaggregatedDimension = {
  render: Template,
  args: {
    rawSeries: data.barHistogramUnaggregatedDimension,
  },
};

export const BarOrdinalXScale = {
  render: Template,
  args: {
    rawSeries: data.barOrdinalXScale,
  },
};

export const BarOrdinalXScaleAutoRotatedLabels = {
  render: Template,
  args: {
    rawSeries: data.barOrdinalXScaleAutoRotatedLabels,
  },
};

export const BarStackedTotalFormattedValues = {
  render: Template,
  args: {
    rawSeries: data.barStackedTotalFormattedValues,
  },
};

export const BarStackedPowYAxis = {
  render: Template,
  args: {
    rawSeries: data.barStackedPowYAxis,
  },
};

export const BarStackedPowYAxisNegatives = {
  render: Template,
  args: {
    rawSeries: data.barStackedPowYAxisNegatives,
  },
};

export const YAxisCompactWithoutDataLabels = {
  render: Template,
  args: {
    rawSeries: data.yAxisCompactWithoutDataLabels,
  },
};

export const BarFormattingFull = {
  render: Template,
  args: {
    rawSeries: data.barFormattingFull,
  },
};

export const BarAutoFormattingCompact = {
  render: Template,
  args: {
    rawSeries: data.barAutoFormattingCompact,
  },
};

export const BarAutoFormattingFull = {
  render: Template,
  args: {
    rawSeries: data.barAutoFormattingFull,
    getColor: color,
  } as any,
};

export const BarLogYScaleStacked = {
  render: Template,
  args: {
    rawSeries: data.barLogYScaleStacked,
  },
};

export const BarLogYScaleStackedNegative = {
  render: Template,
  args: {
    rawSeries: data.barLogYScaleStackedNegative,
  },
};

export const BarStackedNormalizedEmptySpace37880 = {
  render: Template,
  args: {
    rawSeries: data.barStackedNormalizedEmptySpace37880,
  },
};

export const BarTwoAxesStackedWithNegativeValues = {
  render: Template,
  args: {
    rawSeries: data.barTwoAxesStackedWithNegativeValues,
  },
};

export const BarBreakoutWithLineSeriesStackedRightAxisOnly = {
  render: Template,
  args: {
    rawSeries: data.barBreakoutWithLineSeriesStackedRightAxisOnly,
  },
};

export const BarsBreakoutSortedWithNegativeValuesPowerYAxis = {
  render: Template,
  args: {
    rawSeries: data.barsBreakoutSortedWithNegativeValuesPowerYAxis,
  },
};

export const BarFullyNullDimension37902 = {
  render: Template,
  args: {
    rawSeries: data.barFullyNullDimension37902,
  },
};

export const SplitYAxis = {
  render: Template,
  args: {
    rawSeries: data.autoYSplit,
  },
};

export const GoalLineOutOfBounds37848 = {
  render: Template,
  args: {
    rawSeries: data.goalLineOutOfBounds37848,
  },
};

export const GoalLineUnderSeries38824 = {
  render: Template,
  args: {
    rawSeries: data.goalLineUnderSeries38824,
  },
};

export const GoalVerySmall = {
  render: Template,
  args: {
    rawSeries: data.goalVerySmall,
  },
};

export const GoalBetweenExtentAndChartBound = {
  render: Template,
  args: {
    rawSeries: data.goalBetweenExtentAndChartBound,
  },
};

export const GoalLineDisabled = {
  render: Template,
  args: {
    rawSeries: data.goalLineDisabled,
  },
};

export const TrendSingleSeriesLine = {
  render: Template,
  args: {
    rawSeries: data.trendSingleSeriesLine,
  },
};

export const TrendMultiSeriesLine = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesLine,
  },
};

export const TrendSingleSeriesArea = {
  render: Template,
  args: {
    rawSeries: data.trendSingleSeriesArea,
  },
};

export const TrendMultiSeriesArea = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesArea,
  },
};

export const TrendMultiSeriesStackedArea = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesStackedArea,
  },
};

export const TrendMultiSeriesNormalizedStackedArea = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesNormalizedStackedArea,
  },
};

export const TrendSingleSeriesBar = {
  render: Template,
  args: {
    rawSeries: data.trendSingleSeriesBar,
  },
};

export const TrendMultiSeriesBar = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesBar,
  },
};

export const TrendMultiSeriesStackedBar = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesStackedBar,
  },
};

export const TrendMultiSeriesNormalizedStackedBar = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesNormalizedStackedBar,
  },
};

export const TrendCombo = {
  render: Template,
  args: {
    rawSeries: data.trendCombo,
  },
};

export const TrendComboPower = {
  render: Template,
  args: {
    rawSeries: data.trendComboPower,
  },
};

export const TrendComboLog = {
  render: Template,
  args: {
    rawSeries: data.trendComboLog,
  },
};

export const ComboHistogram = {
  render: Template,
  args: {
    rawSeries: data.comboHistogram,
  },
};

export const CombinedBarTimeSeriesDifferentGranularityWithBreakout = {
  render: Template,
  args: {
    rawSeries: data.combinedBarTimeSeriesDifferentGranularityWithBreakout,
  },
};

export const NumericXAxisIncludesZero37082 = {
  render: Template,
  args: {
    rawSeries: data.numericXAxisIncludesZero37082,
  },
};

export const WrongYAxisRange37306 = {
  render: Template,
  args: {
    rawSeries: data.wrongYAxisRange37306,
  },
};

export const LongDimensionNameCutOff37420 = {
  render: Template,
  args: {
    rawSeries: data.longDimensionNameCutOff37420,
  },
};

export const CompactXAxisDoesNotWork38917 = {
  render: Template,
  args: {
    rawSeries: data.compactXAxisDoesNotWork38917,
  },
};

export const DataLabelsUnderTrendGoalLines41280 = {
  render: Template,
  args: {
    rawSeries: data.dataLabelsUnderTrendGoalLines41280,
  },
};

export const TicksNativeWeekWithGapShortRange = {
  render: Template,
  args: {
    rawSeries: data.ticksNativeWeekWithGapShortRange,
  },
};

export const TicksNativeWeekWithGapLongRange = {
  render: Template,
  args: {
    rawSeries: data.ticksNativeWeekWithGapLongRange,
  },
};

export const BarStackLinearXAxis = {
  render: Template,
  args: {
    rawSeries: data.barStackLinearXAxis,
  },
};

export const AreaStackLinearXAxis = {
  render: Template,
  args: {
    rawSeries: data.areaStackLinearXAxis,
  },
};

export const NullCategoryValueFormatting = {
  render: Template,
  args: {
    rawSeries: data.nullCategoryValueFormatting,
  },
};

export const NumberOfInsightsError39608 = {
  render: Template,
  args: {
    rawSeries: data.numberOfInsightsError39608,
  },
};

export const AreaStackInterpolateMissingValues = {
  render: Template,
  args: {
    rawSeries: data.areaStackInterpolateMissingValues,
  },
};

export const AreaStackAllSeriesWithoutInterpolation = {
  render: Template,
  args: {
    rawSeries: data.areaStackAllSeriesWithoutInterpolation,
  },
};

export const AreaOverBar = {
  render: Template,
  args: {
    rawSeries: data.areaOverBar,
  },
};

export const TimeSeriesTicksCompactFormattingMixedTimezones = {
  render: Template,
  args: {
    rawSeries: data.timeSeriesTicksCompactFormattingMixedTimezones,
  },
};

export const TimezoneTicksPlacement = {
  render: Template,
  args: {
    rawSeries: data.timezoneTicksPlacement,
  },
};

export const BarRelativeDatetimeOrdinalScale = {
  render: Template,
  args: {
    rawSeries: data.barRelativeDatetimeOrdinalScale,
  },
};

export const BarTwoDaysOfWeek = {
  render: Template,
  args: {
    rawSeries: data.barTwoDaysOfWeek,
  },
};

export const AreaStackedAutoDataLabels = {
  render: Template,
  args: {
    rawSeries: data.areaStackedAutoDataLabels,
  },
};

export const ImageCutOff37275 = {
  render: Template,
  args: {
    rawSeries: data.imageCutOff37275,
  },
};

export const IncorrectLabelYAxisSplit41285 = {
  render: Template,
  args: {
    rawSeries: data.incorrectLabelYAxisSplit41285,
  },
};

export const NativeAutoYSplit = {
  render: Template,
  args: {
    rawSeries: data.nativeAutoYSplit,
  },
};

export const TimeSeriesYyyymmddNumbersFormat = {
  render: Template,
  args: {
    rawSeries: data.timeSeriesYyyymmddNumbersFormat,
  },
};

export const BreakoutNullAndEmptyString = {
  render: Template,
  args: {
    rawSeries: data.breakoutNullAndEmptyString,
  },
};

export const NoGoodAxisSplit = {
  render: Template,
  args: {
    rawSeries: data.noGoodAxisSplit,
  },
};

export const HistogramTicks45Degrees = {
  render: Template,
  args: {
    rawSeries: data.histogramTicks45Degrees,
  },
};

export const HistogramTicks90Degrees = {
  render: Template,
  args: {
    rawSeries: data.histogramTicks90Degrees,
  },
};

export const LineUnpinFromZero = {
  render: Template,
  args: {
    rawSeries: data.lineUnpinFromZero,
  },
};

export const LineSettings = {
  render: Template,
  args: {
    rawSeries: data.lineSettings,
  },
};

export const LineReplaceMissingValuesZero = {
  render: Template,
  args: {
    rawSeries: data.lineReplaceMissingValuesZero,
  },
};

export const LineChartBrokenDimensionsMetricsSettings = {
  render: Template,
  args: {
    rawSeries: data.lineChartBrokenDimensionsMetricsSettings,
  },
};

export const ComboStackedBarsAreasNormalized = {
  render: Template,
  args: {
    rawSeries: data.comboStackedBarsAreasNormalized,
  },
};

export const ComboStackedBarsAreas = {
  render: Template,
  args: {
    rawSeries: data.comboStackedBarsAreas,
  },
};

export const TwoBarsTwoAreasOneLineLinear = {
  render: Template,
  args: {
    rawSeries: data.twoBarsTwoAreasOneLineLinear,
  },
};

export const TwoBarsTwoAreasOneLinePower = {
  render: Template,
  args: {
    rawSeries: data.twoBarsTwoAreasOneLinePower,
  },
};

export const TwoBarsTwoAreasOneLineLog = {
  render: Template,
  args: {
    rawSeries: data.twoBarsTwoAreasOneLineLog,
  },
};

export const BarCorrectWidthWhenTwoYAxes = {
  render: Template,
  args: {
    rawSeries: data.barCorrectWidthWhenTwoYAxes,
  },
};

export const BarDataLabelsNegatives = {
  render: Template,
  args: {
    rawSeries: data.barDataLabelsNegatives,
  },
};

export const BarStackedNormalizedSeriesLabels = {
  render: Template,
  args: {
    rawSeries: data.barStackedNormalizedSeriesLabels,
  },
};

export const BarStackedSeriesLabelsAndTotals = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsAndTotals,
  },
};

export const BarStackedSeriesLabelsNoTotals = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsNoTotals,
  },
};

export const BarStackedSeriesLabelsRotated = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsRotated,
  },
};

export const BarStackedSeriesLabelsAutoCompactness = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsAutoCompactness,
  },
};

export const BarStackedSeriesLabelsAndTotalsOrdinal = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsAndTotalsOrdinal,
  },
};

export const BarStackedSeriesLabelsNormalizedAutoCompactness = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsNormalizedAutoCompactness,
  },
};

export const BarStackedLabelsNullVsZero = {
  render: Template,
  args: {
    rawSeries: data.barStackedLabelsNullVsZero,
  },
};

export const BarMinHeightLimit = {
  render: Template,
  args: {
    rawSeries: data.barMinHeightLimit,
  },
};

export const ComboDataLabelsAutoCompactnessPropagatesFromLine = {
  render: Template,
  args: {
    rawSeries: data.comboDataLabelsAutoCompactnessPropagatesFromLine,
  },
};

export const ComboDataLabelsAutoCompactnessPropagatesFromTotals = {
  render: Template,
  args: {
    rawSeries: data.comboDataLabelsAutoCompactnessPropagatesFromTotals,
  },
};

export const AreaChartSteppedNullsInterpolated = {
  render: Template,
  args: {
    rawSeries: data.areaChartSteppedNullsInterpolated,
  },
};

export const AreaChartSteppedNullsSkipped = {
  render: Template,
  args: {
    rawSeries: data.areaChartSteppedNullsSkipped,
  },
};

export const SafariNonIanaTimezoneRepro44128 = {
  render: Template,
  args: {
    rawSeries: data.safariNonIanaTimezoneRepro44128,
  },
};

export const CombinedWithInvalidSettings = {
  render: Template,
  args: {
    rawSeries: data.combinedWithInvalidSettings,
  },
};

export const StackedChartCustomYAxisRange = {
  render: Template,
  args: {
    rawSeries: data.stackedChartCustomYAxisRange,
  },
};

export const SeriesOrderSettingsDoNotMatchSeriesCount = {
  render: Template,
  args: {
    rawSeries: data.seriesOrderSettingsDoNotMatchSeriesCount,
  },
};

export const TrendGoalLinesWithScalingPowScaleCustomRange = {
  render: Template,
  args: {
    rawSeries: data.trendGoalLinesWithScalingPowScaleCustomRange,
  },
};

export const BarStackedAllLabelsTimeseriesWithGap45717 = {
  render: Template,
  args: {
    rawSeries: data.barStackedAllLabelsTimeseriesWithGap45717,
  },
};

export const OffsetBasedTimezone47835 = {
  render: Template,
  args: {
    rawSeries: data.offsetBasedTimezone47835,
  },
};

export const Default = {
  render: Template,
  args: {
    rawSeries: data.messedUpAxis,
  },
};
