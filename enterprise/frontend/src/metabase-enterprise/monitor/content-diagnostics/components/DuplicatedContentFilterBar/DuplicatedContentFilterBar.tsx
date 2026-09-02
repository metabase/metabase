import { memo } from "react";

import { Group } from "metabase/ui";

import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { DuplicatedContentFilterPicker } from "../DuplicatedContentFilterPicker";
import {
  areDuplicatedFilterOptionsEqual,
  getDuplicatedDefaultFilterOptions,
} from "../duplicated-utils";
import type { DuplicatedContentFilterOptions } from "../types";

type DuplicatedContentFilterBarProps = {
  query?: string;
  filterOptions: DuplicatedContentFilterOptions;
  isLoading: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFilterOptionsChange: (
    filterOptions: DuplicatedContentFilterOptions,
  ) => void;
};

export const DuplicatedContentFilterBar = memo(
  function DuplicatedContentFilterBar({
    query,
    filterOptions,
    isLoading,
    onQueryChange,
    onFilterOptionsChange,
  }: DuplicatedContentFilterBarProps) {
    const hasDefaultFilterOptions = areDuplicatedFilterOptionsEqual(
      filterOptions,
      getDuplicatedDefaultFilterOptions(),
    );

    return (
      <Group gap="md" align="center" wrap="nowrap">
        <DiagnosticsSearchInput query={query} onQueryChange={onQueryChange} />
        <DuplicatedContentFilterPicker
          filterOptions={filterOptions}
          isDisabled={isLoading}
          hasDefaultOptions={hasDefaultFilterOptions}
          onFilterOptionsChange={onFilterOptionsChange}
        />
      </Group>
    );
  },
);
