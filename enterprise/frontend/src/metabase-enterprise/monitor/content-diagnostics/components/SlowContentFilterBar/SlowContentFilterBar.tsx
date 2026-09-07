import { memo } from "react";

import { Group } from "metabase/ui";

import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { SlowContentFilterPicker } from "../SlowContentFilterPicker";
import {
  areSlowFilterOptionsEqual,
  getSlowDefaultFilterOptions,
} from "../slow-utils";
import type {
  ContentDiagnosticsFilterBarProps,
  SlowContentFilterOptions,
} from "../types";

export const SlowContentFilterBar = memo(function SlowContentFilterBar({
  query,
  filterOptions,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
  onReset,
}: ContentDiagnosticsFilterBarProps<SlowContentFilterOptions>) {
  const hasDefaultFilterOptions = areSlowFilterOptionsEqual(
    filterOptions,
    getSlowDefaultFilterOptions(),
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
});
