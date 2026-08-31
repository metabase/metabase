import type { AccentColorOptions } from "metabase/ui/colors/types";
import type Question from "metabase-lib/v1/Question";
import type {
  DatasetColumn,
  IconName,
  RawSeries,
  ScalarSegment,
  Series,
  SmartScalarComparison,
  SmartScalarComparisonType,
  TableColumnOrderSetting,
  VisualizationSettings,
} from "metabase-types/api";

import type { ComputedVisualizationSettings } from "./computed-settings";

// Prop contracts for setting widgets that settings definitions reference by
// string name. They live here rather than with the widget components so the
// type dependency runs UI -> core.

export type ChartSettingWidgetProps<TValue> = {
  value: TValue | undefined;
  onChange: (value?: TValue | null) => void;
  onChangeSettings: (settings: Partial<VisualizationSettings>) => void;
};

export type ChartSettingEnumToggleProps<T extends string> = {
  value: T | undefined;
  onChange: (value: T) => void;
  id?: string;
  checkedValue: T;
  uncheckedValue: T;
};

export type ChartSettingSegmentedControlProps = {
  options: { name: string; value: string; icon?: IconName }[];
  onChange: (value: string) => void;
  value: string;
};

export type ChartSettingGoalInputProps = {
  id: string;
  value: number | string;
  onChange: (value: number | string) => void;
  columns?: DatasetColumn[];
  valueField?: string;
};

export type AggregationFunction = Exclude<
  VisualizationSettings["graph.other_category_aggregation_fn"],
  undefined
>;

export type ChartSettingMaxCategoriesProps = ChartSettingWidgetProps<number> & {
  isEnabled?: boolean;
  aggregationFunction: AggregationFunction;
};

export type ChartSettingSegmentsEditorProps = {
  value: ScalarSegment[];
  onChange: (value: ScalarSegment[]) => void;
  canRemoveAll?: boolean;
};

// The fields ChartSettingOrderedItems reads off every row it renders.
export interface ChartSettingOrderedItem {
  enabled: boolean;
  color?: string;
  icon?: IconName;
  isOther?: boolean;
  hideSettings?: boolean;
}

export interface ChartSettingSeriesOrderItem {
  key: string;
  enabled: boolean;
  name: string;
  color?: string;
  hidden?: boolean;
  hideSettings?: boolean;
}

export type ChartSettingSeriesOrderProps = {
  onChange: (rows: ChartSettingSeriesOrderItem[]) => void;
  value: ChartSettingSeriesOrderItem[];
  onShowWidget: (
    widget: { id?: string; props?: { seriesKey: string } },
    ref: HTMLElement | undefined,
  ) => void;
  series: Series;
  hasEditSettings: boolean;
  onChangeSeriesColor: (seriesKey: string, color: string) => void;
  onSortEnd: (newItems: ChartSettingSeriesOrderItem[]) => void;
  isSortable?: boolean;
  accentColorOptions?: AccentColorOptions;
  getItemColor?: (item: ChartSettingOrderedItem) => string | undefined;
  addButtonLabel?: string;
  searchPickerPlaceholder?: string;
  groupedAfterIndex?: number;
  otherColor?: string;
  otherSettingWidgetId?: string;
  onOtherColorChange?: (newColor: string) => void;
  truncateAfter?: number;
};

export type EditWidgetProps = {
  initialKey: string;
};

export type EditWidgetData = {
  id: string;
  props: EditWidgetProps;
};

export type ChartSettingTableColumnsProps = {
  value: TableColumnOrderSetting[];
  columns: DatasetColumn[];
  question?: Question;
  isShowingDetailsOnlyColumns: boolean;
  getColumnName: (column: DatasetColumn) => string;
  onChange: (value: TableColumnOrderSetting[], question?: Question) => void;
  onShowWidget: (config: EditWidgetData, targetElement: HTMLElement) => void;
};

// The props the map colour setting supplies to ColorRangeSelector.
// The component takes div attributes on top of these, which a setting never passes.
export type ChartSettingColorRangeProps = {
  value: string[];
  colors: string[];
  colorRanges?: string[][];
  colorMapping?: Record<string, string[]>;
  isQuantile?: boolean;
  onChange?: (newValue: string[]) => void;
};

export type DimensionsWidgetProps = {
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  onChangeSettings: (newSettings: ComputedVisualizationSettings) => void;
  onShowWidget: (widget: any, ref: any) => void;
};

type ComparisonMenuOptionOf<TType extends SmartScalarComparisonType> = {
  type: TType;
  name: string;
};

export type ComparisonMenuOption =
  | ComparisonMenuOptionOf<"anotherColumn">
  | ComparisonMenuOptionOf<"previousValue">
  | ComparisonMenuOptionOf<"previousPeriod">
  | (ComparisonMenuOptionOf<"periodsAgo"> & { maxValue: number })
  | ComparisonMenuOptionOf<"staticNumber">;

export type SmartScalarComparisonWidgetProps = {
  onChange: (setting: SmartScalarComparison[]) => void;
  options: ComparisonMenuOption[];
  comparableColumns: DatasetColumn[];
  value: SmartScalarComparison[];
  maxComparisons: number;
  series: RawSeries;
  settings: ComputedVisualizationSettings;
};

export type TreemapGroupsPickerProps = {
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  onChangeSettings: (newSettings: ComputedVisualizationSettings) => void;
  onShowWidget: (
    widget: { id?: string; props?: { seriesKey: string } },
    ref: HTMLElement | undefined,
  ) => void;
};
