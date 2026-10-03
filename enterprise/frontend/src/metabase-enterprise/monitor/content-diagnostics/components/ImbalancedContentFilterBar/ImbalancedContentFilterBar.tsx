import { memo } from "react";

import { Group } from "metabase/ui";

import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { ImbalancedContentFilterPicker } from "../ImbalancedContentFilterPicker";
import {
  areImbalancedFilterOptionsEqual,
  getImbalancedDefaultFilterOptions,
} from "../imbalanced-utils";
import type {
  ContentDiagnosticsFilterBarProps,
  ImbalancedContentFilterOptions,
} from "../types";

export const ImbalancedContentFilterBar = memo(
  function ImbalancedContentFilterBar({
    query,
    filterOptions,
    isLoading,
    onQueryChange,
    onFilterOptionsChange,
    onReset,
  }: ContentDiagnosticsFilterBarProps<ImbalancedContentFilterOptions>) {
    const hasDefaultFilterOptions = areImbalancedFilterOptionsEqual(
      filterOptions,
      getImbalancedDefaultFilterOptions(),
    );
    const canReset = !hasDefaultFilterOptions || query !== undefined;

    return (
      <Group gap="md" align="center" wrap="nowrap">
        <DiagnosticsSearchInput query={query} onQueryChange={onQueryChange} />
        <ImbalancedContentFilterPicker
          filterOptions={filterOptions}
          isDisabled={isLoading}
          hasDefaultOptions={hasDefaultFilterOptions}
          canReset={canReset}
          onFilterOptionsChange={onFilterOptionsChange}
          onReset={onReset}
        />
      </Group>
    );
  },
);
