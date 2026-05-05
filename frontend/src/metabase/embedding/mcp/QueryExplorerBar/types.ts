import type {
  DatePickerUnit,
  DatePickerValue,
} from "metabase/querying/common/types";
import type { IconName } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

export type QueryExplorerBarChartType = {
  type: string;
  icon: IconName;
};

export type TimeRangeConfig = {
  label: string;
  value: DatePickerValue | undefined;
  availableUnits: DatePickerUnit[];
  hasActiveFilter: boolean;
  onChange: (value: DatePickerValue) => void;
  onClear: () => void;
};

export type TimeGranularityItem = {
  bucket: Lib.Bucket;
  unit: TemporalUnit;
  label: string;
};

export type TimeGranularityConfig = {
  label: string;
  currentUnit: TemporalUnit | undefined;
  availableItems: TimeGranularityItem[];
  onChange: (bucket: Lib.Bucket | null) => void;
};

export type QueryExplorerBarProps = {
  chartTypes: QueryExplorerBarChartType[];
  currentChartType: string;
  onChartTypeChange: (type: string) => void;
  timeRange?: TimeRangeConfig;
  timeGranularity?: TimeGranularityConfig;
  onExplore?: () => void;
};
