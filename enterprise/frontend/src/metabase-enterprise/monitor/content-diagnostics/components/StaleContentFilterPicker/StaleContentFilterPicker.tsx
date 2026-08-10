import { t } from "ttag";

import { Input, Select } from "metabase/ui";

import { DiagnosticsFilterPicker } from "../DiagnosticsFilterPicker";
import { getThresholdDaysFilterOptions } from "../stale-utils";
import type { StaleContentFilterOptions } from "../types";
import { ALL_NON_COLLECTION_FILTER_TYPES } from "../utils";

type StaleContentFilterPickerProps = {
  filterOptions: StaleContentFilterOptions;
  isDisabled?: boolean;
  hasDefaultOptions?: boolean;
  onFilterOptionsChange: (filterOptions: StaleContentFilterOptions) => void;
};

export function StaleContentFilterPicker({
  filterOptions,
  isDisabled,
  hasDefaultOptions,
  onFilterOptionsChange,
}: StaleContentFilterPickerProps) {
  const thresholdDaysOptions = getThresholdDaysFilterOptions();

  const handleThresholdDaysChange = (value: string | null) => {
    onFilterOptionsChange({
      ...filterOptions,
      thresholdDays: value != null ? Number(value) : undefined,
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
        <Input.Wrapper label={t`Inactive for`}>
          <Select
            mt="sm"
            data={thresholdDaysOptions.map((option) => ({
              value: String(option.value),
              label: option.label,
            }))}
            value={
              filterOptions.thresholdDays != null
                ? String(filterOptions.thresholdDays)
                : null
            }
            placeholder={t`Any length of time`}
            clearable
            comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
            onChange={handleThresholdDaysChange}
          />
        </Input.Wrapper>
      }
    />
  );
}
