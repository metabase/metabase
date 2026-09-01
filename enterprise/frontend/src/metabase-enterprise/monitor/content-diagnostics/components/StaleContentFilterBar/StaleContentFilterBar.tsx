import { memo } from "react";

import { Group } from "metabase/ui";

import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { StaleContentFilterPicker } from "../StaleContentFilterPicker";
import {
  areStaleFilterOptionsEqual,
  getStaleDefaultFilterOptions,
} from "../stale-utils";
import type { StaleContentFilterOptions } from "../types";

type StaleContentFilterBarProps = {
  query?: string;
  filterOptions: StaleContentFilterOptions;
  isLoading: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFilterOptionsChange: (filterOptions: StaleContentFilterOptions) => void;
};

export const StaleContentFilterBar = memo(function StaleContentFilterBar({
  query,
  filterOptions,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
}: StaleContentFilterBarProps) {
  const hasDefaultFilterOptions = areStaleFilterOptionsEqual(
    filterOptions,
    getStaleDefaultFilterOptions(),
  );

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <DiagnosticsSearchInput query={query} onQueryChange={onQueryChange} />
      <StaleContentFilterPicker
        filterOptions={filterOptions}
        isDisabled={isLoading}
        hasDefaultOptions={hasDefaultFilterOptions}
        onFilterOptionsChange={onFilterOptionsChange}
      />
    </Group>
  );
});
