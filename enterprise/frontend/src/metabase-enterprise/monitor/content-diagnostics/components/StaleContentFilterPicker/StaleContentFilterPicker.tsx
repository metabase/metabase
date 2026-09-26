import { t } from "ttag";

import { DiagnosticsFilterPicker } from "../DiagnosticsFilterPicker";
import { DiagnosticsThresholdFilter } from "../DiagnosticsThresholdFilter";
import { getThresholdDaysFilterOptions } from "../stale-utils";
import type {
  ContentDiagnosticsFilterPickerProps,
  StaleContentFilterOptions,
} from "../types";
import { ALL_NON_COLLECTION_FILTER_TYPES } from "../utils";

export function StaleContentFilterPicker({
  filterOptions,
  onFilterOptionsChange,
  ...props
}: ContentDiagnosticsFilterPickerProps<StaleContentFilterOptions>) {
  return (
    <DiagnosticsFilterPicker
      {...props}
      filterOptions={filterOptions}
      onFilterOptionsChange={onFilterOptionsChange}
      availableTypes={ALL_NON_COLLECTION_FILTER_TYPES}
      extraFilters={
        <DiagnosticsThresholdFilter
          label={t`Inactive for`}
          placeholder={t`Any length of time`}
          options={getThresholdDaysFilterOptions()}
          value={filterOptions.thresholdDays}
          onChange={(thresholdDays) =>
            onFilterOptionsChange({ ...filterOptions, thresholdDays })
          }
        />
      }
    />
  );
}
