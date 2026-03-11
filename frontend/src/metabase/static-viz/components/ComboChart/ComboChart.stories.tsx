import type { StoryFn } from "@storybook/react";
import { updateIn } from "icepick";

import { color } from "metabase/lib/colors";
import {
  measureTextHeight,
  measureTextWidth,
} from "metabase/static-viz/lib/text";
import { DEFAULT_VISUALIZATION_THEME } from "metabase/visualizations/shared/utils/theme";
import type { RenderingContext } from "metabase/visualizations/types";

import type { StaticChartProps } from "../StaticVisualization";
import { StaticVisualization } from "../StaticVisualization";

import { data } from "./stories-data";

export default {
  title: "Viz/Static Viz/ComboChart",
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

export const LineLinearXScale = {
  render: Template,
  args: {
    rawSeries: data.lineLinearXScale as any,
    renderingContext,
  },
};

export const LineLinearXScaleUnsorted = {
  render: Template,
  args: {
    rawSeries: data.lineLinearXScaleUnsorted as any,
    renderingContext,
  },
};

export const LogYScaleCustomYAxisRange = {
  render: Template,
  args: {
    rawSeries: data.logYScaleCustomYAxisRange as any,
    renderingContext,
  },
};

export const PowYScaleCustomYAxisRange = {
  render: Template,
  args: {
    rawSeries: data.powYScaleCustomYAxisRange as any,
    renderingContext,
  },
};

export const LineLogYScale = {
  render: Template,
  args: {
    rawSeries: data.lineLogYScale as any,
    renderingContext,
  },
};

export const GoalLineLogYScale = {
  render: Template,
  args: {
    rawSeries: data.goalLineLogYScale as any,
    renderingContext,
  },
};

export const GoalLinePowYScale = {
  render: Template,
  args: {
    rawSeries: data.goalLinePowYScale as any,
    renderingContext,
  },
};

export const LineLogYScaleNegative = {
  render: Template,
  args: {
    rawSeries: data.lineLogYScaleNegative as any,
    renderingContext,
  },
};

export const LineShowDotsAuto = {
  render: Template,
  args: {
    rawSeries: data.lineShowDotsAuto as any,
    renderingContext,
  },
};

export const LineShowDotsOn = {
  render: Template,
  args: {
    rawSeries: data.lineShowDotsOn as any,
    renderingContext,
  },
};

export const LineShowDotsOff = {
  render: Template,
  args: {
    rawSeries: data.lineShowDotsOff as any,
    renderingContext,
  },
};

export const LineCustomYAxisRangeEqualsExtents = {
  render: Template,
  args: {
    rawSeries: data.lineCustomYAxisRangeEqualsExtents as any,
    renderingContext,
  },
};

export const LineCustomYAxisRangeOffScreenHigh = {
  render: Template,
  args: {
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
    rawSeries: data.customYAxisRangeWithColumnScaling as any,
    renderingContext,
  },
};

export const LineFullyNullDimension37902 = {
  render: Template,
  args: {
    rawSeries: data.lineFullyNullDimension37902 as any,
    renderingContext,
  },
};

export const AreaFullyNullDimension37902 = {
  render: Template,
  args: {
    rawSeries: data.areaFullyNullDimension37902 as any,
    renderingContext,
  },
};

export const BarLinearXScale = {
  render: Template,
  args: {
    rawSeries: data.barLinearXScale as any,
    renderingContext,
  },
};

export const BarHistogramXScale = {
  render: Template,
  args: {
    rawSeries: data.barHistogramXScale as any,
    renderingContext,
  },
};

export const BarHistogramMultiSeries = {
  render: Template,
  args: {
    rawSeries: data.barHistogramMultiSeries as any,
    renderingContext,
  },
};

export const BarHistogramMultiSeriesBinned = {
  render: Template,
  args: {
    rawSeries: data.barHistogramMultiSeriesBinned as any,
    renderingContext,
  },
};

export const BarHistogramSeriesBreakout = {
  render: Template,
  args: {
    rawSeries: data.barHistogramSeriesBreakout as any,
    renderingContext,
  },
};

export const BarHistogramStacked = {
  render: Template,
  args: {
    rawSeries: data.barHistogramStacked as any,
    renderingContext,
  },
};

export const BarHistogramStackedNormalized = {
  render: Template,
  args: {
    rawSeries: data.barHistogramStackedNormalized as any,
    renderingContext,
  },
};

export const BarHistogramUnaggregatedDimension = {
  render: Template,
  args: {
    rawSeries: data.barHistogramUnaggregatedDimension as any,
    renderingContext,
  },
};

export const BarOrdinalXScale = {
  render: Template,
  args: {
    rawSeries: data.barOrdinalXScale as any,
    renderingContext,
  },
};

export const BarOrdinalXScaleAutoRotatedLabels = {
  render: Template,
  args: {
    rawSeries: data.barOrdinalXScaleAutoRotatedLabels as any,
    renderingContext,
  },
};

export const BarStackedTotalFormattedValues = {
  render: Template,
  args: {
    rawSeries: data.barStackedTotalFormattedValues as any,
    renderingContext,
  },
};

export const BarStackedPowYAxis = {
  render: Template,
  args: {
    rawSeries: data.barStackedPowYAxis as any,
    renderingContext,
  },
};

export const BarStackedPowYAxisNegatives = {
  render: Template,
  args: {
    rawSeries: data.barStackedPowYAxisNegatives as any,
    renderingContext,
  },
};

export const YAxisCompactWithoutDataLabels = {
  render: Template,
  args: {
    rawSeries: data.yAxisCompactWithoutDataLabels as any,
    renderingContext,
  },
};

export const BarFormattingFull = {
  render: Template,
  args: {
    rawSeries: data.barFormattingFull as any,
    renderingContext,
  },
};

export const BarAutoFormattingCompact = {
  render: Template,
  args: {
    rawSeries: data.barAutoFormattingCompact as any,
    renderingContext,
  },
};

export const BarAutoFormattingFull = {
  render: Template,
  args: {
    rawSeries: data.barAutoFormattingFull as any,
    renderingContext,
    getColor: color,
  } as any,
};

export const BarLogYScaleStacked = {
  render: Template,
  args: {
    rawSeries: data.barLogYScaleStacked as any,
    renderingContext,
  },
};

export const BarLogYScaleStackedNegative = {
  render: Template,
  args: {
    rawSeries: data.barLogYScaleStackedNegative as any,
    renderingContext,
  },
};

export const BarStackedNormalizedCustomMinMax48021 = {
  render: Template,
  args: {
    rawSeries: data.barStackedNormalizedCustomMinMax48021 as any,
    renderingContext,
  },
};

export const BarStackedNormalizedGoalLine51054 = {
  render: Template,
  args: {
    rawSeries: data.barStackedNormalizedGoalLine51054 as any,
    renderingContext,
  },
};

export const BarStackedNormalizedEmptySpace37880 = {
  render: Template,
  args: {
    rawSeries: data.barStackedNormalizedEmptySpace37880 as any,
    renderingContext,
  },
};

export const BarTwoAxesStackedWithNegativeValues = {
  render: Template,
  args: {
    rawSeries: data.barTwoAxesStackedWithNegativeValues as any,
    renderingContext,
  },
};

export const BarBreakoutWithLineSeriesStackedRightAxisOnly = {
  render: Template,
  args: {
    rawSeries: data.barBreakoutWithLineSeriesStackedRightAxisOnly as any,
    renderingContext,
  },
};

export const BarsBreakoutSortedWithNegativeValuesPowerYAxis = {
  render: Template,
  args: {
    rawSeries: data.barsBreakoutSortedWithNegativeValuesPowerYAxis as any,
    renderingContext,
  },
};

export const BarFullyNullDimension37902 = {
  render: Template,
  args: {
    rawSeries: data.barFullyNullDimension37902 as any,
    renderingContext,
  },
};

export const SplitYAxis = {
  render: Template,
  args: {
    rawSeries: data.autoYSplit as any,
    renderingContext,
  },
};

export const GoalLineOutOfBounds37848 = {
  render: Template,
  args: {
    rawSeries: data.goalLineOutOfBounds37848 as any,
    renderingContext,
  },
};

export const GoalLineUnderSeries38824 = {
  render: Template,
  args: {
    rawSeries: data.goalLineUnderSeries38824 as any,
    renderingContext,
  },
};

export const GoalVerySmall = {
  render: Template,
  args: {
    rawSeries: data.goalVerySmall as any,
    renderingContext,
  },
};

export const GoalBetweenExtentAndChartBound = {
  render: Template,
  args: {
    rawSeries: data.goalBetweenExtentAndChartBound as any,
    renderingContext,
  },
};

export const GoalLineDisabled = {
  render: Template,
  args: {
    rawSeries: data.goalLineDisabled as any,
    renderingContext,
  },
};

export const TrendSingleSeriesLine = {
  render: Template,
  args: {
    rawSeries: data.trendSingleSeriesLine as any,
    renderingContext,
  },
};

export const TrendMultiSeriesLine = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesLine as any,
    renderingContext,
  },
};

export const TrendSingleSeriesArea = {
  render: Template,
  args: {
    rawSeries: data.trendSingleSeriesArea as any,
    renderingContext,
  },
};

export const TrendMultiSeriesArea = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesArea as any,
    renderingContext,
  },
};

export const TrendMultiSeriesStackedArea = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesStackedArea as any,
    renderingContext,
  },
};

export const TrendMultiSeriesNormalizedStackedArea = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesNormalizedStackedArea as any,
    renderingContext,
  },
};

export const TrendSingleSeriesBar = {
  render: Template,
  args: {
    rawSeries: data.trendSingleSeriesBar as any,
    renderingContext,
  },
};

export const TrendMultiSeriesBar = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesBar as any,
    renderingContext,
  },
};

export const TrendMultiSeriesStackedBar = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesStackedBar as any,
    renderingContext,
  },
};

export const TrendMultiSeriesNormalizedStackedBar = {
  render: Template,
  args: {
    rawSeries: data.trendMultiSeriesNormalizedStackedBar as any,
    renderingContext,
  },
};

export const TrendCombo = {
  render: Template,
  args: {
    rawSeries: data.trendCombo as any,
    renderingContext,
  },
};

export const TrendComboPower = {
  render: Template,
  args: {
    rawSeries: data.trendComboPower as any,
    renderingContext,
  },
};

export const TrendComboLog = {
  render: Template,
  args: {
    rawSeries: data.trendComboLog as any,
    renderingContext,
  },
};

export const ComboHistogram = {
  render: Template,
  args: {
    rawSeries: data.comboHistogram as any,
    renderingContext,
  },
};

export const CombinedBarTimeSeriesDifferentGranularityWithBreakout = {
  render: Template,
  args: {
    rawSeries:
      data.combinedBarTimeSeriesDifferentGranularityWithBreakout as any,
    renderingContext,
  },
};

export const NumericXAxisIncludesZero37082 = {
  render: Template,
  args: {
    rawSeries: data.numericXAxisIncludesZero37082 as any,
    renderingContext,
  },
};

export const WrongYAxisRange37306 = {
  render: Template,
  args: {
    rawSeries: data.wrongYAxisRange37306 as any,
    renderingContext,
  },
};

export const LongDimensionNameCutOff37420 = {
  render: Template,
  args: {
    rawSeries: data.longDimensionNameCutOff37420 as any,
    renderingContext,
  },
};

export const CompactXAxisDoesNotWork38917 = {
  render: Template,
  args: {
    rawSeries: data.compactXAxisDoesNotWork38917 as any,
    renderingContext,
  },
};

export const DataLabelsUnderTrendGoalLines41280 = {
  render: Template,
  args: {
    rawSeries: data.dataLabelsUnderTrendGoalLines41280 as any,
    renderingContext,
  },
};

export const TicksNativeWeekWithGapShortRange = {
  render: Template,
  args: {
    rawSeries: data.ticksNativeWeekWithGapShortRange as any,
    renderingContext,
  },
};

export const TicksNativeWeekWithGapLongRange = {
  render: Template,
  args: {
    rawSeries: data.ticksNativeWeekWithGapLongRange as any,
    renderingContext,
  },
};

export const BarStackLinearXAxis = {
  render: Template,
  args: {
    rawSeries: data.barStackLinearXAxis as any,
    renderingContext,
  },
};

export const AreaStackLinearXAxis = {
  render: Template,
  args: {
    rawSeries: data.areaStackLinearXAxis as any,
    renderingContext,
  },
};

export const NullCategoryValueFormatting = {
  render: Template,
  args: {
    rawSeries: data.nullCategoryValueFormatting as any,
    renderingContext,
  },
};

export const NumberOfInsightsError39608 = {
  render: Template,
  args: {
    rawSeries: data.numberOfInsightsError39608 as any,
    renderingContext,
  },
};

export const AreaStackInterpolateMissingValues = {
  render: Template,
  args: {
    rawSeries: data.areaStackInterpolateMissingValues as any,
    renderingContext,
  },
};

export const AreaStackAllSeriesWithoutInterpolation = {
  render: Template,
  args: {
    rawSeries: data.areaStackAllSeriesWithoutInterpolation as any,
    renderingContext,
  },
};

export const AreaOverBar = {
  render: Template,
  args: {
    rawSeries: data.areaOverBar as any,
    renderingContext,
  },
};

export const TimeSeriesTicksCompactFormattingMixedTimezones = {
  render: Template,
  args: {
    rawSeries: data.timeSeriesTicksCompactFormattingMixedTimezones as any,
    renderingContext,
  },
};

export const TimezoneTicksPlacement = {
  render: Template,
  args: {
    rawSeries: data.timezoneTicksPlacement as any,
    renderingContext,
  },
};

export const BarRelativeDatetimeOrdinalScale = {
  render: Template,
  args: {
    rawSeries: data.barRelativeDatetimeOrdinalScale as any,
    renderingContext,
  },
};

export const BarTwoDaysOfWeek = {
  render: Template,
  args: {
    rawSeries: data.barTwoDaysOfWeek as any,
    renderingContext,
  },
};

export const AreaStackedAutoDataLabels = {
  render: Template,
  args: {
    rawSeries: data.areaStackedAutoDataLabels as any,
    renderingContext,
  },
};

export const ImageCutOff37275 = {
  render: Template,
  args: {
    rawSeries: data.imageCutOff37275 as any,
    renderingContext,
  },
};

export const IncorrectLabelYAxisSplit41285 = {
  render: Template,
  args: {
    rawSeries: data.incorrectLabelYAxisSplit41285 as any,
    renderingContext,
  },
};

export const NativeAutoYSplit = {
  render: Template,
  args: {
    rawSeries: data.nativeAutoYSplit as any,
    renderingContext,
  },
};

export const TimeSeriesYyyymmddNumbersFormat = {
  render: Template,
  args: {
    rawSeries: data.timeSeriesYyyymmddNumbersFormat as any,
    renderingContext,
  },
};

export const BreakoutNullAndEmptyString = {
  render: Template,
  args: {
    rawSeries: data.breakoutNullAndEmptyString as any,
    renderingContext,
  },
};

export const NoGoodAxisSplit = {
  render: Template,
  args: {
    rawSeries: data.noGoodAxisSplit as any,
    renderingContext,
  },
};

export const HistogramTicks45Degrees = {
  render: Template,
  args: {
    rawSeries: data.histogramTicks45Degrees as any,
    renderingContext,
  },
};

export const HistogramTicks90Degrees = {
  render: Template,
  args: {
    rawSeries: data.histogramTicks90Degrees as any,
    renderingContext,
  },
};

export const LineUnpinFromZero = {
  render: Template,
  args: {
    rawSeries: data.lineUnpinFromZero as any,
    renderingContext,
  },
};

export const LineSettings = {
  render: Template,
  args: {
    rawSeries: data.lineSettings as any,
    renderingContext,
  },
};

export const LineReplaceMissingValuesZero = {
  render: Template,
  args: {
    rawSeries: data.lineReplaceMissingValuesZero as any,
    renderingContext,
  },
};

export const LineChartBrokenDimensionsMetricsSettings = {
  render: Template,
  args: {
    rawSeries: data.lineChartBrokenDimensionsMetricsSettings as any,
    renderingContext,
  },
};

export const ComboStackedBarsAreasNormalized = {
  render: Template,
  args: {
    rawSeries: data.comboStackedBarsAreasNormalized as any,
    renderingContext,
  },
};

export const ComboStackedBarsAreas = {
  render: Template,
  args: {
    rawSeries: data.comboStackedBarsAreas as any,
    renderingContext,
  },
};

export const TwoBarsTwoAreasOneLineLinear = {
  render: Template,
  args: {
    rawSeries: data.twoBarsTwoAreasOneLineLinear as any,
    renderingContext,
  },
};

export const TwoBarsTwoAreasOneLinePower = {
  render: Template,
  args: {
    rawSeries: data.twoBarsTwoAreasOneLinePower as any,
    renderingContext,
  },
};

export const TwoBarsTwoAreasOneLineLog = {
  render: Template,
  args: {
    rawSeries: data.twoBarsTwoAreasOneLineLog as any,
    renderingContext,
  },
};

export const BarCorrectWidthWhenTwoYAxes = {
  render: Template,
  args: {
    rawSeries: data.barCorrectWidthWhenTwoYAxes as any,
    renderingContext,
  },
};

export const BarDataLabelsNegatives = {
  render: Template,
  args: {
    rawSeries: data.barDataLabelsNegatives as any,
    renderingContext,
  },
};

export const BarStackedNormalizedSeriesLabels = {
  render: Template,
  args: {
    rawSeries: data.barStackedNormalizedSeriesLabels as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsAndTotals = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsAndTotals as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsNoTotals = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsNoTotals as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsRotated = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsRotated as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsAutoCompactness = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsAutoCompactness as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsAndTotalsOrdinal = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsAndTotalsOrdinal as any,
    renderingContext,
  },
};

export const BarStackedSeriesLabelsNormalizedAutoCompactness = {
  render: Template,
  args: {
    rawSeries: data.barStackedSeriesLabelsNormalizedAutoCompactness as any,
    renderingContext,
  },
};

export const BarStackedLabelsNullVsZero = {
  render: Template,
  args: {
    rawSeries: data.barStackedLabelsNullVsZero as any,
    renderingContext,
  },
};

export const BarMinHeightLimit = {
  render: Template,
  args: {
    rawSeries: data.barMinHeightLimit as any,
    renderingContext,
  },
};

export const ComboDataLabelsAutoCompactnessPropagatesFromLine = {
  render: Template,
  args: {
    rawSeries: data.comboDataLabelsAutoCompactnessPropagatesFromLine as any,
    renderingContext,
  },
};

export const ComboDataLabelsAutoCompactnessPropagatesFromTotals = {
  render: Template,
  args: {
    rawSeries: data.comboDataLabelsAutoCompactnessPropagatesFromTotals as any,
    renderingContext,
  },
};

export const AreaChartSteppedNullsInterpolated = {
  render: Template,
  args: {
    rawSeries: data.areaChartSteppedNullsInterpolated as any,
    renderingContext,
  },
};

export const AreaChartSteppedNullsSkipped = {
  render: Template,
  args: {
    rawSeries: data.areaChartSteppedNullsSkipped as any,
    renderingContext,
  },
};

export const SafariNonIanaTimezoneRepro44128 = {
  render: Template,
  args: {
    rawSeries: data.safariNonIanaTimezoneRepro44128 as any,
    renderingContext,
  },
};

export const CombinedWithInvalidSettings = {
  render: Template,
  args: {
    rawSeries: data.combinedWithInvalidSettings as any,
    renderingContext,
  },
};

export const StackedChartCustomYAxisRange = {
  render: Template,
  args: {
    rawSeries: data.stackedChartCustomYAxisRange as any,
    renderingContext,
  },
};

export const SeriesOrderSettingsDoNotMatchSeriesCount = {
  render: Template,
  args: {
    rawSeries: data.seriesOrderSettingsDoNotMatchSeriesCount as any,
    renderingContext,
  },
};

export const TrendGoalLinesWithScalingPowScaleCustomRange = {
  render: Template,
  args: {
    rawSeries: data.trendGoalLinesWithScalingPowScaleCustomRange as any,
    renderingContext,
  },
};

export const BarStackedAllLabelsTimeseriesWithGap45717 = {
  render: Template,
  args: {
    rawSeries: data.barStackedAllLabelsTimeseriesWithGap45717 as any,
    renderingContext,
  },
};

export const BarMaxCategoriesDefault = {
  render: Template,

  args: {
    rawSeries: data.barMaxCategoriesDefault as any,
    renderingContext,
  },
};

export const BarMaxCategoriesStacked = {
  render: Template,

  args: {
    rawSeries: data.barMaxCategoriesStacked as any,
    renderingContext,
  },
};

export const BarMaxCategoriesStackedNormalized = {
  render: Template,

  args: {
    rawSeries: data.barMaxCategoriesStackedNormalized as any,
    renderingContext,
  },
};

export const OffsetBasedTimezone47835 = {
  render: Template,
  args: {
    rawSeries: data.offsetBasedTimezone47835 as any,
    renderingContext,
  },
};

export const BarNonLinearNumericXAxis = {
  render: Template,
  args: {
    rawSeries: data.barNonLinearNumericXAxis as any,
    renderingContext,
  },
};

export const BarWidthDstTimezones56424 = {
  render: Template,
  args: {
    rawSeries: data.barWidthDstTimezones56424 as any,
    renderingContext,
  },
};

export const Default = {
  render: Template,
  args: {
    rawSeries: data.messedUpAxis as any,
    renderingContext,
  },
};

export const Watermark = {
  render: Template,
  args: {
    rawSeries: data.barWidthDstTimezones56424 as any,
    renderingContext,
    hasDevWatermark: true,
  },
};

export const VisualizerTimeseriesDifferentUnits = {
  render: Template,
  args: {
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
