import { memo } from "react";

import { Group } from "metabase/ui";

import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { SlowContentFilterPicker } from "../SlowContentFilterPicker";
import {
  areSlowFilterOptionsEqual,
  getSlowDefaultFilterOptions,
} from "../slow-utils";
import type { SlowContentFilterOptions } from "../types";

type SlowContentFilterBarProps = {
  query?: string;
  filterOptions: SlowContentFilterOptions;
  isLoading: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFilterOptionsChange: (filterOptions: SlowContentFilterOptions) => void;
};

export const SlowContentFilterBar = memo(function SlowContentFilterBar({
  query,
  filterOptions,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
}: SlowContentFilterBarProps) {
  const hasDefaultFilterOptions = areSlowFilterOptionsEqual(
    filterOptions,
    getSlowDefaultFilterOptions(),
  );

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <DiagnosticsSearchInput query={query} onQueryChange={onQueryChange} />
      <SlowContentFilterPicker
        filterOptions={filterOptions}
        isDisabled={isLoading}
        hasDefaultOptions={hasDefaultFilterOptions}
        onFilterOptionsChange={onFilterOptionsChange}
      />
    </Group>
  );
});
