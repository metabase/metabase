import { Group } from "metabase/ui";

import { staleContentConfig } from "../../config";
import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { StaleContentFilterPicker } from "../StaleContentFilterPicker";
import type {
  ContentDiagnosticsFilterBarProps,
  StaleContentFilterOptions,
} from "../types";

export function StaleContentFilterBar({
  query,
  filterOptions,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
  onReset,
}: ContentDiagnosticsFilterBarProps<StaleContentFilterOptions>) {
  const hasDefaultFilterOptions = staleContentConfig.areFilterOptionsEqual(
    filterOptions,
    staleContentConfig.getDefaultFilterOptions(),
  );
  const canReset = !hasDefaultFilterOptions || query !== undefined;

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <DiagnosticsSearchInput query={query} onQueryChange={onQueryChange} />
      <StaleContentFilterPicker
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
