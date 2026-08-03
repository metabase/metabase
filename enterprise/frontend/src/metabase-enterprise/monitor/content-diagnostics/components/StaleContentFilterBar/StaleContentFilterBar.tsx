import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, type ReactNode, memo, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, Group, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

import { StaleContentFilterPicker } from "../StaleContentFilterPicker";
import {
  areStaleFilterOptionsEqual,
  getStaleDefaultFilterOptions,
} from "../stale-utils";
import type { StaleContentFilterOptions } from "../types";
import { ALL_FILTER_TYPES } from "../utils";

type StaleContentFilterBarProps = {
  query?: string;
  filterOptions: StaleContentFilterOptions;
  isLoading: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFilterOptionsChange: (filterOptions: StaleContentFilterOptions) => void;
  actions?: ReactNode;
};

export const StaleContentFilterBar = memo(function StaleContentFilterBar({
  query,
  filterOptions,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
  actions,
}: StaleContentFilterBarProps) {
  const [searchValue, setSearchValue] = useState(query ?? "");
  const hasDefaultFilterOptions = areStaleFilterOptionsEqual(
    filterOptions,
    getStaleDefaultFilterOptions(),
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
        data-testid="content-diagnostics-search-input"
        onChange={handleSearchChange}
      />
      <StaleContentFilterPicker
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
