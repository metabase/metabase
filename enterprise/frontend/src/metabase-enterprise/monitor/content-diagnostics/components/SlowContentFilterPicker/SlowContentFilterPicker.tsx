import { t } from "ttag";

import { Input, Select } from "metabase/ui";

import { DiagnosticsFilterPicker } from "../DiagnosticsFilterPicker";
import { getDurationFilterOptions } from "../slow-utils";
import type { SlowContentFilterOptions } from "../types";
import { ALL_NON_COLLECTION_FILTER_TYPES } from "../utils";

type SlowContentFilterPickerProps = {
  filterOptions: SlowContentFilterOptions;
  isDisabled?: boolean;
  hasDefaultOptions?: boolean;
  onFilterOptionsChange: (filterOptions: SlowContentFilterOptions) => void;
};

export function SlowContentFilterPicker({
  filterOptions,
  isDisabled,
  hasDefaultOptions,
  onFilterOptionsChange,
}: SlowContentFilterPickerProps) {
  const durationOptions = getDurationFilterOptions();

  const handleDurationChange = (value: string | null) => {
    onFilterOptionsChange({
      ...filterOptions,
      minDurationMs: value != null ? Number(value) : undefined,
    });
  };

  return (
    <DiagnosticsFilterPicker
      filterOptions={filterOptions}
      availableTypes={ALL_NON_COLLECTION_FILTER_TYPES}
      isDisabled={isDisabled}
      hasDefaultOptions={hasDefaultOptions}
      onFilterOptionsChange={onFilterOptionsChange}
      extraFilters={
        <Input.Wrapper label={t`Duration`}>
          <Select
            mt="sm"
            data={durationOptions.map((option) => ({
              value: String(option.value),
              label: option.label,
            }))}
            value={
              filterOptions.minDurationMs != null
                ? String(filterOptions.minDurationMs)
                : null
            }
            placeholder={t`Any duration`}
            clearable
            comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
            onChange={handleDurationChange}
          />
        </Input.Wrapper>
      }
    />
  );
}
