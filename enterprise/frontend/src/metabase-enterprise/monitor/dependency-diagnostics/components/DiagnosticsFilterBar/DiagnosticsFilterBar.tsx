import { memo } from "react";

import { Group } from "metabase/ui";
import type { DependencyFilterOptions } from "metabase-enterprise/dependencies/types";
import {
  areFilterOptionsEqual,
  getDependencyGroupTypeInfo,
} from "metabase-enterprise/dependencies/utils";
import {
  DiagnosticsFilterPicker,
  DiagnosticsSearchInput,
} from "metabase-enterprise/monitor/components";

import type { DependencyDiagnosticsMode } from "../types";
import { getAvailableGroupTypes, getDefaultFilterOptions } from "../utils";

type DiagnosticsFilterBarProps = {
  mode: DependencyDiagnosticsMode;
  query?: string;
  filterOptions: DependencyFilterOptions;
  isFetching: boolean;
  isLoading: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

export const DiagnosticsFilterBar = memo(function DiagnosticsFilterBar({
  mode,
  query,
  filterOptions,
  isFetching,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
}: DiagnosticsFilterBarProps) {
  const hasDefaultFilterOptions = areFilterOptionsEqual(
    filterOptions,
    getDefaultFilterOptions(mode),
  );

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <DiagnosticsSearchInput
        query={query}
        isFetching={isFetching}
        isLoading={isLoading}
        data-testid="dependency-list-search-input"
        onChange={onQueryChange}
      />
      <DiagnosticsFilterPicker
        availableTypes={getAvailableGroupTypes(mode)}
        selectedTypes={filterOptions.groupTypes}
        includePersonalCollections={filterOptions.includePersonalCollections}
        getTypeLabel={(type) => getDependencyGroupTypeInfo(type).label}
        isDisabled={isLoading}
        hasDefaultOptions={hasDefaultFilterOptions}
        buttonTestId="dependency-filter-button"
        onChange={({ types, includePersonalCollections }) =>
          onFilterOptionsChange({
            groupTypes: types,
            includePersonalCollections,
          })
        }
      />
    </Group>
  );
});
