import { t } from "ttag";

import { Input, Select } from "metabase/ui";

import { DiagnosticsFilterPicker } from "../DiagnosticsFilterPicker";
import { getDuplicateCountFilterOptions } from "../duplicated-utils";
import type { DuplicatedContentFilterOptions } from "../types";
import { ALL_FILTER_TYPES } from "../utils";

type DuplicatedContentFilterPickerProps = {
  filterOptions: DuplicatedContentFilterOptions;
  isDisabled?: boolean;
  hasDefaultOptions?: boolean;
  onFilterOptionsChange: (
    filterOptions: DuplicatedContentFilterOptions,
  ) => void;
};

export function DuplicatedContentFilterPicker({
  filterOptions,
  isDisabled,
  hasDefaultOptions,
  onFilterOptionsChange,
}: DuplicatedContentFilterPickerProps) {
  const duplicateCountOptions = getDuplicateCountFilterOptions();

  const handleDuplicateCountChange = (value: string | null) => {
    onFilterOptionsChange({
      ...filterOptions,
      minDuplicateCount: value != null ? Number(value) : undefined,
    });
  };

  return (
    <DiagnosticsFilterPicker
      filterOptions={filterOptions}
      availableTypes={ALL_FILTER_TYPES}
      isDisabled={isDisabled}
      hasDefaultOptions={hasDefaultOptions}
      onFilterOptionsChange={onFilterOptionsChange}
      extraFilters={
        <Input.Wrapper label={t`Duplicates`}>
          <Select
            mt="sm"
            data={duplicateCountOptions.map((option) => ({
              value: String(option.value),
              label: option.label,
            }))}
            value={
              filterOptions.minDuplicateCount != null
                ? String(filterOptions.minDuplicateCount)
                : null
            }
            placeholder={t`Any number of duplicates`}
            clearable
            comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
            onChange={handleDuplicateCountChange}
          />
        </Input.Wrapper>
      }
    />
  );
}
