import { t } from "ttag";

import { DiagnosticsFilterPicker } from "../DiagnosticsFilterPicker";
import { DiagnosticsThresholdFilter } from "../DiagnosticsThresholdFilter";
import { getDurationFilterOptions } from "../slow-utils";
import type {
  ContentDiagnosticsFilterPickerProps,
  SlowContentFilterOptions,
} from "../types";
import { ALL_NON_COLLECTION_FILTER_TYPES } from "../utils";

export function SlowContentFilterPicker({
  filterOptions,
  onFilterOptionsChange,
  ...props
}: ContentDiagnosticsFilterPickerProps<SlowContentFilterOptions>) {
  return (
    <DiagnosticsFilterPicker
      {...props}
      filterOptions={filterOptions}
      onFilterOptionsChange={onFilterOptionsChange}
      availableTypes={ALL_NON_COLLECTION_FILTER_TYPES}
      extraFilters={
        <DiagnosticsThresholdFilter
          label={t`Duration`}
          placeholder={t`Any duration`}
          options={getDurationFilterOptions()}
          value={filterOptions.minDurationMs}
          onChange={(minDurationMs) =>
            onFilterOptionsChange({ ...filterOptions, minDurationMs })
          }
        />
      }
    />
  );
}
