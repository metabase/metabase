import { Group } from "metabase/ui";

import { duplicatedContentConfig } from "../../config";
import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { DuplicatedContentFilterPicker } from "../DuplicatedContentFilterPicker";
import type {
  ContentDiagnosticsFilterBarProps,
  DuplicatedContentFilterOptions,
} from "../types";

export function DuplicatedContentFilterBar({
  query,
  filterOptions,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
  onReset,
}: ContentDiagnosticsFilterBarProps<DuplicatedContentFilterOptions>) {
  const hasDefaultFilterOptions = duplicatedContentConfig.areFilterOptionsEqual(
    filterOptions,
    duplicatedContentConfig.getDefaultFilterOptions(),
  );
  const canReset = !hasDefaultFilterOptions || query !== undefined;

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <DiagnosticsSearchInput query={query} onQueryChange={onQueryChange} />
      <DuplicatedContentFilterPicker
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
