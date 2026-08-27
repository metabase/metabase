import type {
  BoxPlotPointsMode,
  BoxPlotShowValuesMode,
  BoxPlotWhiskerType,
  DatasetColumn,
  RowValue,
} from "metabase-types/api";

import type {
  BreakoutSeriesModel,
  CategoryXAxisModel,
  ChartDataset,
  DataKey,
  DimensionModel,
  NumericAxisScaleTransforms,
  RegularSeriesModel,
  SeriesFormatters,
  YAxisModel,
} from "../../cartesian/model/types";

export type { BoxPlotPointsMode, BoxPlotShowValuesMode, BoxPlotWhiskerType };

export type BoxPlotRawDataPoint = {
  value: number;
  datum: Record<string, RowValue>;
  index: number;
};

export type BoxPlotDatum = {
  xValue: RowValue;
  seriesKey: DataKey;
  seriesIndex: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  outliers: number[];
  rawDataPoints: BoxPlotRawDataPoint[];
};

export type BoxPlotLabelFrequency = "fit" | "all";

export type BoxPlotSeriesModel = RegularSeriesModel | BreakoutSeriesModel;

export type BoxPlotChartModel = {
  // Dataset for boxplot/mean/labels series - one row per x-value
  // Columns: X_AXIS_DATA_KEY, and for each series: min, q1, median, q3, max, mean
  boxDataset: ChartDataset;

  // Dense dataset for outliers above the upper whisker - labels positioned at top
  // Columns: X_AXIS_DATA_KEY, and for each series: dataKey (with transformed y-value)
  outlierAbovePointsDataset: ChartDataset;

  // Dense dataset for outliers below the lower whisker - labels positioned at bottom
  // Columns: X_AXIS_DATA_KEY, and for each series: dataKey (with transformed y-value)
  outlierBelowPointsDataset: ChartDataset;

  // Dense dataset for non-outlier scatter points
  // Columns: X_AXIS_DATA_KEY, and for each series: dataKey (with transformed y-value)
  nonOutlierPointsDataset: ChartDataset;

  // O(1) lookup: seriesKey -> xValue -> BoxPlotDatum (original scale values)
  dataBySeriesAndXValue: Map<DataKey, Map<RowValue, BoxPlotDatum>>;

  // Unique x-axis values, order preserved from sorted dataset
  xValues: RowValue[];

  // Dimension model for column info
  dimensionModel: DimensionModel;

  // Breakout column info (if using breakout mode)
  breakoutColumn?: DatasetColumn;

  // Column lookup
  columnByDataKey: Record<DataKey, DatasetColumn>;

  // Series models (multiple for multi-series)
  seriesModels: BoxPlotSeriesModel[];

  // Axis models
  xAxisModel: CategoryXAxisModel;
  leftAxisModel: YAxisModel | null;
  rightAxisModel: YAxisModel | null;
  yAxisScaleTransforms: NumericAxisScaleTransforms;

  // Series axis assignment for yAxisIndex
  leftAxisSeriesKeys: Set<DataKey>;
  rightAxisSeriesKeys: Set<DataKey>;

  // BoxPlot-specific display settings
  pointsMode: BoxPlotPointsMode;
  whiskerType: BoxPlotWhiskerType;
  showMean: boolean;
  showValuesMode: BoxPlotShowValuesMode | null;
  seriesLabelsFormatters: SeriesFormatters;
  labelFrequency: BoxPlotLabelFrequency;
};
