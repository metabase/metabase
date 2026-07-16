import { updateIn } from "icepick";

import { color } from "metabase/ui/colors";

import { StaticVisualization } from "../../StaticVisualization";
import { data } from "../stories-data";

import { Template, renderingContext } from "./shared";

export default {
  title: "Viz/Static Viz/ComboChart",
  component: StaticVisualization,
};

// ================================
// the Loki stress test workflow runs on entire files, not individual stories, so stress testing this file is extremely slow
// add new stories to their own file, see Bar45DegreeLabels.stories.tsx for an example
// ================================

export const LineLinearXScale = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineLinearXScale as any,
    renderingContext,
  },
};

export const LineLinearXScaleUnsorted = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineLinearXScaleUnsorted as any,
    renderingContext,
  },
};

export const LogYScaleCustomYAxisRange = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.logYScaleCustomYAxisRange as any,
    renderingContext,
  },
};

export const PowYScaleCustomYAxisRange = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.powYScaleCustomYAxisRange as any,
    renderingContext,
  },
};

export const LineLogYScale = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineLogYScale as any,
    renderingContext,
  },
};

export const GoalLineLogYScale = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.goalLineLogYScale as any,
    renderingContext,
  },
};

export const GoalLinePowYScale = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.goalLinePowYScale as any,
    renderingContext,
  },
};

export const LineLogYScaleNegative = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineLogYScaleNegative as any,
    renderingContext,
  },
};

export const LineShowDotsAuto = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineShowDotsAuto as any,
    renderingContext,
  },
};

export const LineShowDotsOn = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineShowDotsOn as any,
    renderingContext,
  },
};

export const LineShowDotsOff = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineShowDotsOff as any,
    renderingContext,
  },
};

export const LineCustomYAxisRangeEqualsExtents = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineCustomYAxisRangeEqualsExtents as any,
    renderingContext,
  },
};

export const LineCustomYAxisRangeOffScreenHigh = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: updateIn(
      data.lineCustomYAxisRangeEqualsExtents,
      [0, "card", "visualization_settings"],
      (val) => ({ ...val, "graph.y_axis.max": 1000, "graph.y_axis.min": 200 }),
    ) as any,
    renderingContext,
  },
};

export const LineCustomYAxisRangeOffScreenLow = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: updateIn(
      data.lineCustomYAxisRangeEqualsExtents,
      [0, "card", "visualization_settings"],
      (val) => ({ ...val, "graph.y_axis.max": 0, "graph.y_axis.min": -100 }),
    ) as any,
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

export const LineFullyNullDimension37902 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineFullyNullDimension37902 as any,
    renderingContext,
  },
};

export const AreaFullyNullDimension37902 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.areaFullyNullDimension37902 as any,
    renderingContext,
  },
};

export const BarLinearXScale = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barLinearXScale as any,
    renderingContext,
  },
};

export const BarHistogramXScale = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barHistogramXScale as any,
    renderingContext,
  },
};

export const BarHistogramMultiSeries = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barHistogramMultiSeries as any,
    renderingContext,
  },
};

export const BarHistogramMultiSeriesBinned = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barHistogramMultiSeriesBinned as any,
    renderingContext,
  },
};

export const BarHistogramSeriesBreakout = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barHistogramSeriesBreakout as any,
    renderingContext,
  },
};

export const BarHistogramStacked = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barHistogramStacked as any,
    renderingContext,
  },
};

export const BarHistogramStackedNormalized = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barHistogramStackedNormalized as any,
    renderingContext,
  },
};

export const BarHistogramUnaggregatedDimension = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barHistogramUnaggregatedDimension as any,
    renderingContext,
  },
};

export const BarOrdinalXScale = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barOrdinalXScale as any,
    renderingContext,
  },
};

export const BarOrdinalXScaleAutoRotatedLabels = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barOrdinalXScaleAutoRotatedLabels as any,
    renderingContext,
  },
};

export const BarStackedTotalFormattedValues = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedTotalFormattedValues as any,
    renderingContext,
  },
};

export const BarStackedPowYAxis = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedPowYAxis as any,
    renderingContext,
  },
};

export const BarStackedPowYAxisNegatives = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedPowYAxisNegatives as any,
    renderingContext,
  },
};

export const YAxisCompactWithoutDataLabels = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.yAxisCompactWithoutDataLabels as any,
    renderingContext,
  },
};

export const BarFormattingFull = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barFormattingFull as any,
    renderingContext,
  },
};

export const BarAutoFormattingCompact = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barAutoFormattingCompact as any,
    renderingContext,
  },
};

export const BarAutoFormattingFull = {
  render: Template,
  // Unjustified type cast. FIXME
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barAutoFormattingFull as any,
    renderingContext,
    getColor: color,
  } as any,
};

export const BarLogYScaleStacked = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barLogYScaleStacked as any,
    renderingContext,
  },
};

export const BarLogYScaleStackedNegative = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barLogYScaleStackedNegative as any,
    renderingContext,
  },
};

export const BarStackedNormalizedCustomMinMax48021 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedNormalizedCustomMinMax48021 as any,
    renderingContext,
  },
};

export const BarStackedNormalizedGoalLine51054 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedNormalizedGoalLine51054 as any,
    renderingContext,
  },
};

export const BarStackedNormalizedEmptySpace37880 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedNormalizedEmptySpace37880 as any,
    renderingContext,
  },
};

export const BarTwoAxesStackedWithNegativeValues = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barTwoAxesStackedWithNegativeValues as any,
    renderingContext,
  },
};

export const BarBreakoutWithLineSeriesStackedRightAxisOnly = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barBreakoutWithLineSeriesStackedRightAxisOnly as any,
    renderingContext,
  },
};

export const BarsBreakoutSortedWithNegativeValuesPowerYAxis = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barsBreakoutSortedWithNegativeValuesPowerYAxis as any,
    renderingContext,
  },
};

export const BarFullyNullDimension37902 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barFullyNullDimension37902 as any,
    renderingContext,
  },
};

export const SplitYAxis = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.autoYSplit as any,
    renderingContext,
  },
};

export const GoalLineOutOfBounds37848 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.goalLineOutOfBounds37848 as any,
    renderingContext,
  },
};

export const GoalLineUnderSeries38824 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.goalLineUnderSeries38824 as any,
    renderingContext,
  },
};

export const GoalVerySmall = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.goalVerySmall as any,
    renderingContext,
  },
};

export const GoalBetweenExtentAndChartBound = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.goalBetweenExtentAndChartBound as any,
    renderingContext,
  },
};

export const GoalLineDisabled = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.goalLineDisabled as any,
    renderingContext,
  },
};

export const TrendSingleSeriesLine = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendSingleSeriesLine as any,
    renderingContext,
  },
};

export const TrendMultiSeriesLine = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendMultiSeriesLine as any,
    renderingContext,
  },
};

export const TrendSingleSeriesArea = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendSingleSeriesArea as any,
    renderingContext,
  },
};

export const TrendMultiSeriesArea = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendMultiSeriesArea as any,
    renderingContext,
  },
};

export const TrendMultiSeriesStackedArea = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendMultiSeriesStackedArea as any,
    renderingContext,
  },
};

export const TrendMultiSeriesNormalizedStackedArea = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendMultiSeriesNormalizedStackedArea as any,
    renderingContext,
  },
};

export const TrendSingleSeriesBar = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendSingleSeriesBar as any,
    renderingContext,
  },
};

export const TrendMultiSeriesBar = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendMultiSeriesBar as any,
    renderingContext,
  },
};

export const TrendMultiSeriesStackedBar = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendMultiSeriesStackedBar as any,
    renderingContext,
  },
};

export const TrendMultiSeriesNormalizedStackedBar = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendMultiSeriesNormalizedStackedBar as any,
    renderingContext,
  },
};

export const TrendCombo = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendCombo as any,
    renderingContext,
  },
};

export const TrendComboPower = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendComboPower as any,
    renderingContext,
  },
};

export const TrendComboLog = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendComboLog as any,
    renderingContext,
  },
};

export const ComboHistogram = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.comboHistogram as any,
    renderingContext,
  },
};

export const CombinedBarTimeSeriesDifferentGranularityWithBreakout = {
  render: Template,
  args: {
    rawSeries:
      // Unjustified type cast. FIXME
      data.combinedBarTimeSeriesDifferentGranularityWithBreakout as any,
    renderingContext,
  },
};

export const NumericXAxisIncludesZero37082 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.numericXAxisIncludesZero37082 as any,
    renderingContext,
  },
};

export const WrongYAxisRange37306 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.wrongYAxisRange37306 as any,
    renderingContext,
  },
};

export const LongDimensionNameCutOff37420 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.longDimensionNameCutOff37420 as any,
    renderingContext,
  },
};

export const CompactXAxisDoesNotWork38917 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.compactXAxisDoesNotWork38917 as any,
    renderingContext,
  },
};

export const DataLabelsUnderTrendGoalLines41280 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.dataLabelsUnderTrendGoalLines41280 as any,
    renderingContext,
  },
};

export const TicksNativeWeekWithGapShortRange = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.ticksNativeWeekWithGapShortRange as any,
    renderingContext,
  },
};

export const TicksNativeWeekWithGapLongRange = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.ticksNativeWeekWithGapLongRange as any,
    renderingContext,
  },
};

export const BarStackLinearXAxis = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackLinearXAxis as any,
    renderingContext,
  },
};

export const AreaStackLinearXAxis = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.areaStackLinearXAxis as any,
    renderingContext,
  },
};

export const NullCategoryValueFormatting = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.nullCategoryValueFormatting as any,
    renderingContext,
  },
};

export const NumberOfInsightsError39608 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.numberOfInsightsError39608 as any,
    renderingContext,
  },
};

export const AreaStackInterpolateMissingValues = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.areaStackInterpolateMissingValues as any,
    renderingContext,
  },
};

export const AreaStackAllSeriesWithoutInterpolation = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.areaStackAllSeriesWithoutInterpolation as any,
    renderingContext,
  },
};

export const AreaOverBar = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.areaOverBar as any,
    renderingContext,
  },
};

export const TimeSeriesTicksCompactFormattingMixedTimezones = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.timeSeriesTicksCompactFormattingMixedTimezones as any,
    renderingContext,
  },
};

export const TimezoneTicksPlacement = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.timezoneTicksPlacement as any,
    renderingContext,
  },
};

export const BarRelativeDatetimeOrdinalScale = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barRelativeDatetimeOrdinalScale as any,
    renderingContext,
  },
};

export const BarTwoDaysOfWeek = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barTwoDaysOfWeek as any,
    renderingContext,
  },
};

export const AreaStackedAutoDataLabels = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.areaStackedAutoDataLabels as any,
    renderingContext,
  },
};

export const ImageCutOff37275 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.imageCutOff37275 as any,
    renderingContext,
  },
};

export const IncorrectLabelYAxisSplit41285 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.incorrectLabelYAxisSplit41285 as any,
    renderingContext,
  },
};

export const NativeAutoYSplit = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.nativeAutoYSplit as any,
    renderingContext,
  },
};

export const TimeSeriesYyyymmddNumbersFormat = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.timeSeriesYyyymmddNumbersFormat as any,
    renderingContext,
  },
};

export const BreakoutNullAndEmptyString = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.breakoutNullAndEmptyString as any,
    renderingContext,
  },
};

export const NoGoodAxisSplit = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.noGoodAxisSplit as any,
    renderingContext,
  },
};

export const HistogramTicks45Degrees = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.histogramTicks45Degrees as any,
    renderingContext,
  },
};

export const HistogramTicks90Degrees = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.histogramTicks90Degrees as any,
    renderingContext,
  },
};

export const LineUnpinFromZero = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineUnpinFromZero as any,
    renderingContext,
  },
};

export const LineSettings = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineSettings as any,
    renderingContext,
  },
};

export const LineReplaceMissingValuesZero = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineReplaceMissingValuesZero as any,
    renderingContext,
  },
};

export const LineChartBrokenDimensionsMetricsSettings = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.lineChartBrokenDimensionsMetricsSettings as any,
    renderingContext,
  },
};

export const ComboStackedBarsAreasNormalized = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.comboStackedBarsAreasNormalized as any,
    renderingContext,
  },
};

export const ComboStackedBarsAreas = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.comboStackedBarsAreas as any,
    renderingContext,
  },
};

export const TwoBarsTwoAreasOneLineLinear = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.twoBarsTwoAreasOneLineLinear as any,
    renderingContext,
  },
};

export const TwoBarsTwoAreasOneLinePower = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.twoBarsTwoAreasOneLinePower as any,
    renderingContext,
  },
};

export const TwoBarsTwoAreasOneLineLog = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.twoBarsTwoAreasOneLineLog as any,
    renderingContext,
  },
};

export const BarCorrectWidthWhenTwoYAxes = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barCorrectWidthWhenTwoYAxes as any,
    renderingContext,
  },
};

export const BarDataLabelsNegatives = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barDataLabelsNegatives as any,
    renderingContext,
  },
};

export const BarStackedNormalizedSeriesLabels = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedNormalizedSeriesLabels as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsAndTotals = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedSeriesLabelsAndTotals as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsNoTotals = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedSeriesLabelsNoTotals as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsRotated = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedSeriesLabelsRotated as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsAutoCompactness = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedSeriesLabelsAutoCompactness as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsAndTotalsOrdinal = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedSeriesLabelsAndTotalsOrdinal as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsNormalizedAutoCompactness = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedSeriesLabelsNormalizedAutoCompactness as any,
    renderingContext,
  },
};

export const BarStackedLabelsNullVsZero = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedLabelsNullVsZero as any,
    renderingContext,
  },
};

export const BarMinHeightLimit = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barMinHeightLimit as any,
    renderingContext,
  },
};

export const ComboDataLabelsAutoCompactnessPropagatesFromLine = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.comboDataLabelsAutoCompactnessPropagatesFromLine as any,
    renderingContext,
  },
};

export const ComboDataLabelsAutoCompactnessPropagatesFromTotals = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.comboDataLabelsAutoCompactnessPropagatesFromTotals as any,
    renderingContext,
  },
};

export const AreaChartSteppedNullsInterpolated = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.areaChartSteppedNullsInterpolated as any,
    renderingContext,
  },
};

export const AreaChartSteppedNullsSkipped = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.areaChartSteppedNullsSkipped as any,
    renderingContext,
  },
};

export const SafariNonIanaTimezoneRepro44128 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.safariNonIanaTimezoneRepro44128 as any,
    renderingContext,
  },
};

export const CombinedWithInvalidSettings = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.combinedWithInvalidSettings as any,
    renderingContext,
  },
};

export const StackedChartCustomYAxisRange = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.stackedChartCustomYAxisRange as any,
    renderingContext,
  },
};

export const SeriesOrderSettingsDoNotMatchSeriesCount = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.seriesOrderSettingsDoNotMatchSeriesCount as any,
    renderingContext,
  },
};

export const TrendGoalLinesWithScalingPowScaleCustomRange = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.trendGoalLinesWithScalingPowScaleCustomRange as any,
    renderingContext,
  },
};

export const BarStackedAllLabelsTimeseriesWithGap45717 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barStackedAllLabelsTimeseriesWithGap45717 as any,
    renderingContext,
  },
};

export const BarMaxCategoriesDefault = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barMaxCategoriesDefault as any,
    renderingContext,
  },
};

export const BarMaxCategoriesStacked = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barMaxCategoriesStacked as any,
    renderingContext,
  },
};

export const BarMaxCategoriesStackedNormalized = {
  render: Template,

  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barMaxCategoriesStackedNormalized as any,
    renderingContext,
  },
};

export const OffsetBasedTimezone47835 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.offsetBasedTimezone47835 as any,
    renderingContext,
  },
};

export const BarNonLinearNumericXAxis = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barNonLinearNumericXAxis as any,
    renderingContext,
  },
};

export const BarWidthDstTimezones56424 = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barWidthDstTimezones56424 as any,
    renderingContext,
  },
};

export const Default = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.messedUpAxis as any,
    renderingContext,
  },
};

export const Watermark = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.barWidthDstTimezones56424 as any,
    renderingContext,
    hasDevWatermark: true,
  },
};

export const VisualizerTimeseriesDifferentUnits = {
  render: Template,
  args: {
    // Unjustified type cast. FIXME
    rawSeries: data.visualizerTimeseriesDifferentUnits as any,
    renderingContext,
  },
};

export const SymlogDecimals = {
  render: Template,
  args: {
    rawSeries: data.symlogDecimals,
    renderingContext,
  },
};

export const LineChartSplitPanelsTimeseriesDifferentRanges = {
  render: Template,
  args: {
    rawSeries: data.lineChartSplitPanelsTimeseriesDifferentRanges,
    renderingContext,
  },
};

export const ComboSplitPanelsMixedSeriesDisplaySettings = {
  render: Template,
  args: {
    rawSeries: data.comboSplitPanelsMixedSeriesDisplaySettings,
    renderingContext,
  },
};

export const BarSplitPanelsOrdinalMixedTicksWidthsPerPanel = {
  render: Template,
  args: {
    rawSeries: data.barSplitPanelsOrdinalMixedTicksWidthsPerPanel,
    renderingContext,
  },
};

// ================================
// the Loki stress test workflow runs on entire files, not individual stories, so stress testing this file is extremely slow
// add new stories to their own file, see Bar45DegreeLabels.stories.tsx for an example
// ================================
