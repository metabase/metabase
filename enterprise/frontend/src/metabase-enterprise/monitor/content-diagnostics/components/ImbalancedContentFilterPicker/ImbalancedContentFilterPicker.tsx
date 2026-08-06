import { DiagnosticsFilterPicker } from "../DiagnosticsFilterPicker";
import type { ImbalancedContentFilterOptions } from "../types";
import { ALL_FILTER_TYPES } from "../utils";

type ImbalancedContentFilterPickerProps = {
  filterOptions: ImbalancedContentFilterOptions;
  isDisabled?: boolean;
  hasDefaultOptions?: boolean;
  onFilterOptionsChange: (
    filterOptions: ImbalancedContentFilterOptions,
  ) => void;
};

export function ImbalancedContentFilterPicker({
  filterOptions,
  isDisabled,
  hasDefaultOptions,
  onFilterOptionsChange,
}: ImbalancedContentFilterPickerProps) {
  return (
    <DiagnosticsFilterPicker
      filterOptions={filterOptions}
      availableTypes={ALL_FILTER_TYPES}
      isDisabled={isDisabled}
      hasDefaultOptions={hasDefaultOptions}
      onFilterOptionsChange={onFilterOptionsChange}
    />
  );
}
