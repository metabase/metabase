import type { Dayjs } from "dayjs";
import type { OptionAxisType } from "echarts/types/src/coord/axisCommonTypes";

import type {
  X_AXIS_DATA_KEY,
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  ORIGINAL_INDEX_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  CardId,
  DatasetColumn,
  DateTimeAbsoluteUnit,
  RowValue,
} from "metabase-types/api";

export type BreakoutValue = RowValue;
export type ColumnName = string;

export type SeriesDataKey =
  | `${Nullable<CardId>}:${ColumnName}:${BreakoutValue}`
  | `${Nullable<CardId>}:${ColumnName}`;
export type StackTotalDataKey =
  | typeof POSITIVE_STACK_TOTAL_DATA_KEY
  | typeof NEGATIVE_STACK_TOTAL_DATA_KEY;
export type DataKey =
  | SeriesDataKey
  | StackTotalDataKey
  | string
  | typeof X_AXIS_DATA_KEY;

export type VizSettingsKey = string;

export type LegacySeriesSettingsObjectKey = {
  card: {
    _seriesKey: VizSettingsKey;
  };
};

export type BaseSeriesModel = {
  name: string;
  color: string;
  dataKey: DataKey;
};

export type RegularSeriesModel = BaseSeriesModel & {
  vizSettingsKey: VizSettingsKey;

  // TODO: remove when the settings definitions are updated for the dynamic combo chart.
  // This object is used as a key for the `series` function of the computed
  // visualization settings to get the computed series settings
  legacySeriesSettingsObjectKey: LegacySeriesSettingsObjectKey;

  cardId?: number;
  tooltipName: string;

  column: DatasetColumn;
  columnIndex: number;
};

export type BreakoutSeriesModel = RegularSeriesModel & {
  breakoutColumn: DatasetColumn;
  breakoutColumnIndex: number;
  breakoutValue: RowValue;
};

export type ScatterSeriesModel = (RegularSeriesModel | BreakoutSeriesModel) & {
  bubbleSizeDataKey?: DataKey;
};

export type TrendLineSeriesModel = BaseSeriesModel & {
  sourceDataKey: DataKey;
};

export type SeriesModel =
  | RegularSeriesModel
  | BreakoutSeriesModel
  | ScatterSeriesModel;

export type DimensionModel = {
  // First card dimension column
  column: DatasetColumn;
  // First card dimension column index
  columnIndex: number;
  // All dimension columns by their card id
  columnByCardId: Record<CardId, DatasetColumn>;
};

export type Datum = Record<DataKey, RowValue> & {
  [X_AXIS_DATA_KEY]: RowValue;
  [ORIGINAL_INDEX_DATA_KEY]?: number;
};
export type ChartDataset<D extends Datum = Datum> = D[];
export type Extent = [number, number];
export type SeriesExtents = Record<DataKey, Extent>;
export type RawValueFormatter = (value: RowValue) => string;
export type LabelFormatter = RawValueFormatter;
export type AxisFormatter = RawValueFormatter;
export type TimeSeriesAxisFormatter = (
  value: RowValue,
  unit?: DateTimeAbsoluteUnit,
) => string;
export type SeriesFormatters = Record<DataKey, LabelFormatter | undefined>;
export type StackedSeriesFormatters = { [T in StackDisplay]?: LabelFormatter };

export type DateRange = [Dayjs, Dayjs];

export type CartesianChartDateTimeAbsoluteUnit =
  | DateTimeAbsoluteUnit
  | "second"
  | "ms";

export type TimeSeriesInterval = {
  count: number;
  unit: CartesianChartDateTimeAbsoluteUnit;
};

// Allows to have non-linear axis scaling
export type NumericAxisScaleTransforms = {
  toEChartsAxisValue: (value: RowValue) => number | null;
  fromEChartsAxisValue: (value: number) => number;
};

export type TimeSeriesAxisScaleTransforms = {
  toEChartsAxisValue: (value: RowValue) => string | null;
  fromEChartsAxisValue: (value: number) => Dayjs;
};

export type BaseXAxisModel = {
  label?: string;
  axisType: OptionAxisType;
  canBrush?: boolean;
};

export type CategoryXAxisModel = BaseXAxisModel & {
  axisType: "category";
  isHistogram: boolean;
  histogramInterval?: number;
  formatter: AxisFormatter;
  valuesCount: number;
};

export type NumericXAxisModel = BaseXAxisModel &
  NumericAxisScaleTransforms & {
    axisType: "value";
    extent: Extent;
    interval: number;
    intervalsCount: number;
    ticksMaxInterval?: number;
    isPadded: boolean;
    formatter: AxisFormatter;
  };

export type TimeSeriesXAxisModel = BaseXAxisModel &
  TimeSeriesAxisScaleTransforms & {
    axisType: "time";
    columnUnit?: DateTimeAbsoluteUnit;
    timezone?: string;
    offsetMinutes?: number;
    interval: TimeSeriesInterval;
    intervalsCount: number;
    range: DateRange;
    formatter: TimeSeriesAxisFormatter;
  };

export type XAxisModel =
  | CategoryXAxisModel
  | NumericXAxisModel
  | TimeSeriesXAxisModel;

export type WaterfallXAxisModel = XAxisModel & { totalXValue?: RowValue };

export type YAxisModel = {
  seriesKeys: DataKey[];
  extent: Extent;
  // Although multiple series from different columns belong to an axis
  // there is one column that is used for the axis ticks formatting
  column: DatasetColumn;
  label?: string;
  formatter: AxisFormatter;
  isNormalized?: boolean;
};

export type TrendLinesModel = {
  dataset: ChartDataset;
  seriesModels: TrendLineSeriesModel[];
};

export type StackDisplay = "bar" | "area";
export type StackModel = {
  axis: "left" | "right";
  display: StackDisplay;
  seriesKeys: DataKey[];
};

type BaseChartDataDensity = {
  type: string;
  averageLabelWidth: number;
  totalNumberOfLabels: number;
};

export type ChartDataDensity =
  | WaterFallChartDataDensity
  | ComboChartDataDensity;

export type WaterFallChartDataDensity = BaseChartDataDensity & {
  type: "waterfall";
};

export type ComboChartDataDensity = BaseChartDataDensity & {
  type: "combo";
  seriesDataKeysWithLabels: DataKey[];
  stackedDisplayWithLabels: StackDisplay[];
  totalNumberOfDots: number;
};

export type BaseCartesianChartModel = {
  dimensionModel: DimensionModel;
  seriesModels: SeriesModel[];
  dataset: ChartDataset;
  transformedDataset: ChartDataset;
  yAxisScaleTransforms: NumericAxisScaleTransforms;
  stackModels: StackModel[];

  leftAxisModel: YAxisModel | null;
  rightAxisModel: YAxisModel | null;
  xAxisModel: XAxisModel;

  columnByDataKey: Record<DataKey, DatasetColumn>;

  // Allows to use multiple ECharts series options to represent single data series
  // and map series ids to data keys for chart events
  seriesIdToDataKey?: Record<string, DataKey>;

  trendLinesModel?: TrendLinesModel;
  seriesLabelsFormatters: SeriesFormatters;
};

export type CartesianChartModel = BaseCartesianChartModel & {
  stackedLabelsFormatters: StackedSeriesFormatters;
  dataDensity: ComboChartDataDensity;
};

export type ScatterPlotModel = BaseCartesianChartModel & {
  bubbleSizeDomain: Extent | null;
};

export type WaterfallChartModel = BaseCartesianChartModel & {
  waterfallLabelFormatter: LabelFormatter | undefined;
  dataDensity: WaterFallChartDataDensity;
};

export type LegendItem = {
  key: string;
  name: string;
  color: string;
  percent?: string;
};
