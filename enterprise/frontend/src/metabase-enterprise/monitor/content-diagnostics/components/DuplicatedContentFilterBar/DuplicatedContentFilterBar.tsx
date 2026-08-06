import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, type ReactNode, memo, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, Group, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

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
  actions?: ReactNode;
};

export const DuplicatedContentFilterBar = memo(
  function DuplicatedContentFilterBar({
    query,
    filterOptions,
    isLoading,
    onQueryChange,
    onFilterOptionsChange,
    actions,
  }: DuplicatedContentFilterBarProps) {
    const [searchValue, setSearchValue] = useState(query ?? "");
    const hasDefaultFilterOptions = areDuplicatedFilterOptionsEqual(
      filterOptions,
      getDuplicatedDefaultFilterOptions(),
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
        <DuplicatedContentFilterPicker
          filterOptions={filterOptions}
          isDisabled={isLoading}
          hasDefaultOptions={hasDefaultFilterOptions}
          onFilterOptionsChange={onFilterOptionsChange}
        />
        {actions}
      </Group>
    );
  },
);
