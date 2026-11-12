import { Group } from "metabase/ui";

import { slowContentConfig } from "../../config";
import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { SlowContentFilterPicker } from "../SlowContentFilterPicker";
import type {
  ContentDiagnosticsFilterBarProps,
  SlowContentFilterOptions,
} from "../types";

export function SlowContentFilterBar({
  query,
  filterOptions,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
  onReset,
}: ContentDiagnosticsFilterBarProps<SlowContentFilterOptions>) {
  const hasDefaultFilterOptions = slowContentConfig.areFilterOptionsEqual(
    filterOptions,
    slowContentConfig.getDefaultFilterOptions(),
  );
  const canReset = !hasDefaultFilterOptions || query !== undefined;

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <DiagnosticsSearchInput query={query} onQueryChange={onQueryChange} />
      <SlowContentFilterPicker
        filterOptions={filterOptions}
        isDisabled={isLoading}
        hasDefaultOptions={hasDefaultFilterOptions}
        canReset={canReset}
        onFilterOptionsChange={onFilterOptionsChange}
        onReset={onReset}
      />
    </Group>
  );
}
