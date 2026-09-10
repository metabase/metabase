import { memo } from "react";

import { Group } from "metabase/ui";

import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { StaleContentFilterPicker } from "../StaleContentFilterPicker";
import {
  areStaleFilterOptionsEqual,
  getStaleDefaultFilterOptions,
} from "../stale-utils";
import type {
  ContentDiagnosticsFilterBarProps,
  StaleContentFilterOptions,
} from "../types";

export const StaleContentFilterBar = memo(function StaleContentFilterBar({
  query,
  filterOptions,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
  onReset,
}: ContentDiagnosticsFilterBarProps<StaleContentFilterOptions>) {
  const hasDefaultFilterOptions = areStaleFilterOptionsEqual(
    filterOptions,
    getStaleDefaultFilterOptions(),
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
});
