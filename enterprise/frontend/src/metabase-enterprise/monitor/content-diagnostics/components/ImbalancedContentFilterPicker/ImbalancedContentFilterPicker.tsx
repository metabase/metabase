import type { ContentDiagnosticsFilterType } from "metabase-types/api";

import { DiagnosticsFilterPicker } from "../DiagnosticsFilterPicker";
import type {
  ContentDiagnosticsFilterPickerProps,
  ImbalancedContentFilterOptions,
} from "../types";

type ImbalancedContentFilterPickerProps =
  ContentDiagnosticsFilterPickerProps<ImbalancedContentFilterOptions> & {
    availableTypes: ContentDiagnosticsFilterType[];
  };

export function ImbalancedContentFilterPicker({
  availableTypes,
  ...props
}: ImbalancedContentFilterPickerProps) {
  return <DiagnosticsFilterPicker {...props} availableTypes={availableTypes} />;
}
