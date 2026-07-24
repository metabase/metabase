import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, type ReactNode, memo, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, Group, Loader, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

import { DiagnosticsFilterPicker } from "../DiagnosticsFilterPicker";
import type { ContentDiagnosticsFilterOptions } from "../types";
import {
  areFilterOptionsEqual,
  getAvailableFilterTypes,
  getDefaultFilterOptions,
} from "../utils";

type DiagnosticsFilterBarProps = {
  query?: string;
  filterOptions: ContentDiagnosticsFilterOptions;
  isFetching: boolean;
  isLoading: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFilterOptionsChange: (
    filterOptions: ContentDiagnosticsFilterOptions,
  ) => void;
  actions?: ReactNode;
};

export const DiagnosticsFilterBar = memo(function DiagnosticsFilterBar({
  query,
  filterOptions,
  isFetching,
  isLoading,
  onQueryChange,
  onFilterOptionsChange,
  actions,
}: DiagnosticsFilterBarProps) {
  const [searchValue, setSearchValue] = useState(query ?? "");
  const hasLoader = isFetching && !isLoading;
  const hasDefaultFilterOptions = areFilterOptionsEqual(
    filterOptions,
    getDefaultFilterOptions(),
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
      <DiagnosticsFilterPicker
        filterOptions={filterOptions}
        availableTypes={getAvailableFilterTypes()}
        isDisabled={isLoading}
        hasDefaultOptions={hasDefaultFilterOptions}
        onFilterOptionsChange={onFilterOptionsChange}
      />
      {actions}
    </Group>
  );
});
