import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, type ReactNode, memo, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, Group, Loader, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

import { SlowDiagnosticsFilterPicker } from "../SlowDiagnosticsFilterPicker";
import {
  areSlowFilterOptionsEqual,
  getSlowDefaultFilterOptions,
} from "../slow-utils";
import type { SlowContentFilterOptions } from "../types";
import { ALL_FILTER_TYPES } from "../utils";

type SlowDiagnosticsFilterBarProps = {
  query?: string;
  filterOptions: SlowContentFilterOptions;
  isFetching: boolean;
  isLoading: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFilterOptionsChange: (filterOptions: SlowContentFilterOptions) => void;
  actions?: ReactNode;
};

export const SlowDiagnosticsFilterBar = memo(function SlowDiagnosticsFilterBar({
  query,
  filterOptions,
  isFetching,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
  actions,
}: SlowDiagnosticsFilterBarProps) {
  const [searchValue, setSearchValue] = useState(query ?? "");
  const hasLoader = isFetching && !isLoading;
  const hasDefaultFilterOptions = areSlowFilterOptionsEqual(
    filterOptions,
    getSlowDefaultFilterOptions(),
  );

  const handleSearchDebounce = useDebouncedCallback(
    (newSearchValue: string) => {
      const trimmed = newSearchValue.trim();
      onQueryChange(trimmed.length > 0 ? trimmed : undefined);
    },
    SEARCH_DEBOUNCE_DURATION,
  );

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newSearchValue = event.target.value;
    setSearchValue(newSearchValue);
    handleSearchDebounce(newSearchValue);
  };

  return (
    <Group gap="md" align="center" wrap="nowrap">
      <TextInput
        value={searchValue}
        placeholder={t`Search…`}
        flex={1}
        leftSection={<FixedSizeIcon name="search" />}
        rightSection={hasLoader ? <Loader size="sm" /> : undefined}
        data-testid="content-diagnostics-search-input"
        onChange={handleSearchChange}
      />
      <SlowDiagnosticsFilterPicker
        filterOptions={filterOptions}
        availableTypes={ALL_FILTER_TYPES}
        isDisabled={isLoading}
        hasDefaultOptions={hasDefaultFilterOptions}
        onFilterOptionsChange={onFilterOptionsChange}
      />
      {actions}
    </Group>
  );
});
