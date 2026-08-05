import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, type ReactNode, memo, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, Group, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

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
  actions?: ReactNode;
};

export const SlowContentFilterBar = memo(function SlowContentFilterBar({
  query,
  filterOptions,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
  actions,
}: SlowContentFilterBarProps) {
  const [searchValue, setSearchValue] = useState(query ?? "");
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
        data-testid="content-diagnostics-search-input"
        onChange={handleSearchChange}
      />
      <SlowContentFilterPicker
        filterOptions={filterOptions}
        isDisabled={isLoading}
        hasDefaultOptions={hasDefaultFilterOptions}
        onFilterOptionsChange={onFilterOptionsChange}
      />
      {actions}
    </Group>
  );
});
