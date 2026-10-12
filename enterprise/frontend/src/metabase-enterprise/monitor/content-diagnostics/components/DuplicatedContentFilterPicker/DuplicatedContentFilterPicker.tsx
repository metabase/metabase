import { t } from "ttag";

import { DiagnosticsFilterPicker } from "../DiagnosticsFilterPicker";
import { DiagnosticsThresholdFilter } from "../DiagnosticsThresholdFilter";
import { getDuplicateCountFilterOptions } from "../duplicated-utils";
import type {
  ContentDiagnosticsFilterPickerProps,
  DuplicatedContentFilterOptions,
} from "../types";
import { ALL_FILTER_TYPES } from "../utils";

export function DuplicatedContentFilterPicker({
  filterOptions,
  onFilterOptionsChange,
  ...props
}: ContentDiagnosticsFilterPickerProps<DuplicatedContentFilterOptions>) {
  return (
    <DiagnosticsFilterPicker
      {...props}
      filterOptions={filterOptions}
      onFilterOptionsChange={onFilterOptionsChange}
      availableTypes={ALL_FILTER_TYPES}
      extraFilters={
        <DiagnosticsThresholdFilter
          label={t`Duplicates`}
          placeholder={t`Any number of duplicates`}
          options={getDuplicateCountFilterOptions()}
          value={filterOptions.minDuplicateCount}
          onChange={(minDuplicateCount) =>
            onFilterOptionsChange({ ...filterOptions, minDuplicateCount })
          }
        />
      }
    />
  );
}
