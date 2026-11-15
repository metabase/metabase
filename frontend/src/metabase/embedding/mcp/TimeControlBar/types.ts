import type {
  DatePickerUnit,
  DatePickerValue,
} from "metabase/querying/common/types";
import type * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import type { TemporalGranularityItem } from "../hooks/useTemporalGranularity";

export interface TimeRangeConfig {
  label: string;
  value: DatePickerValue | undefined;
  availableUnits: DatePickerUnit[];
  hasActiveFilter: boolean;
  onChange: (value: DatePickerValue) => void;
  onClear: () => void;
}

export interface TimeGranularityConfig {
  label: string;
  currentUnit: TemporalUnit | undefined;
  availableItems: TemporalGranularityItem[];
  onChange: (bucket: Lib.Bucket | null) => void;
}
