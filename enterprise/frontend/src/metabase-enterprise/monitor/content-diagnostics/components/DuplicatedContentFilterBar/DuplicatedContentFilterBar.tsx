import { memo } from "react";

import { Group } from "metabase/ui";

import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { DuplicatedContentFilterPicker } from "../DuplicatedContentFilterPicker";
import {
  areDuplicatedFilterOptionsEqual,
  getDuplicatedDefaultFilterOptions,
} from "../duplicated-utils";
import type {
  ContentDiagnosticsFilterBarProps,
  DuplicatedContentFilterOptions,
} from "../types";

export const DuplicatedContentFilterBar = memo(
  function DuplicatedContentFilterBar({
    query,
    filterOptions,
    isLoading,
    onQueryChange,
    onFilterOptionsChange,
    onReset,
  }: ContentDiagnosticsFilterBarProps<DuplicatedContentFilterOptions>) {
    const hasDefaultFilterOptions = areDuplicatedFilterOptionsEqual(
      filterOptions,
      getDuplicatedDefaultFilterOptions(),
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
  },
);
