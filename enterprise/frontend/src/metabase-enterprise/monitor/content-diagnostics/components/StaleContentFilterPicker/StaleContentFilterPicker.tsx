import { DiagnosticsFilterPicker } from "../DiagnosticsFilterPicker";
import type { StaleContentFilterOptions } from "../types";
import { ALL_NON_COLLECTION_FILTER_TYPES } from "../utils";

type StaleContentFilterPickerProps = {
  filterOptions: StaleContentFilterOptions;
  isDisabled?: boolean;
  hasDefaultOptions?: boolean;
  onFilterOptionsChange: (filterOptions: StaleContentFilterOptions) => void;
};

export function StaleContentFilterPicker(props: StaleContentFilterPickerProps) {
  return (
    <DiagnosticsFilterPicker
      {...props}
      availableTypes={ALL_NON_COLLECTION_FILTER_TYPES}
    />
  );
}
