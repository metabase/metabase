import { DiagnosticsFilterPicker } from "../DiagnosticsFilterPicker";
import type {
  ContentDiagnosticsFilterPickerProps,
  ImbalancedContentFilterOptions,
} from "../types";
import { ALL_FILTER_TYPES } from "../utils";

export function ImbalancedContentFilterPicker(
  props: ContentDiagnosticsFilterPickerProps<ImbalancedContentFilterOptions>,
) {
  return (
    <DiagnosticsFilterPicker {...props} availableTypes={ALL_FILTER_TYPES} />
  );
}
