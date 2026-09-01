import { memo } from "react";

import { Group } from "metabase/ui";

import { DiagnosticsSearchInput } from "../DiagnosticsSearchInput";
import { ImbalancedContentFilterPicker } from "../ImbalancedContentFilterPicker";
import {
  areImbalancedFilterOptionsEqual,
  getImbalancedDefaultFilterOptions,
} from "../imbalanced-utils";
import type { ImbalancedContentFilterOptions } from "../types";

type ImbalancedContentFilterBarProps = {
  query?: string;
  filterOptions: ImbalancedContentFilterOptions;
  isLoading: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFilterOptionsChange: (
    filterOptions: ImbalancedContentFilterOptions,
  ) => void;
};

export const ImbalancedContentFilterBar = memo(
  function ImbalancedContentFilterBar({
    query,
    filterOptions,
    isLoading,
    onQueryChange,
    onFilterOptionsChange,
  }: ImbalancedContentFilterBarProps) {
    const hasDefaultFilterOptions = areImbalancedFilterOptionsEqual(
      filterOptions,
      getImbalancedDefaultFilterOptions(),
    );

    return (
      <Group gap="md" align="center" wrap="nowrap">
        <DiagnosticsSearchInput query={query} onQueryChange={onQueryChange} />
        <ImbalancedContentFilterPicker
          filterOptions={filterOptions}
          isDisabled={isLoading}
          hasDefaultOptions={hasDefaultFilterOptions}
          onFilterOptionsChange={onFilterOptionsChange}
        />
      </Group>
    );
  },
);
