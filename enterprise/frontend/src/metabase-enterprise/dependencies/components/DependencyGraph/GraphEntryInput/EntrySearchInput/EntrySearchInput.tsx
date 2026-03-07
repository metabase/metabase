import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  useListRecentsQuery,
  useLogRecentItemMutation,
  useSearchQuery,
} from "metabase/api";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { DefaultSelectItem, FixedSizeIcon, Loader, Select } from "metabase/ui";
import {
  type DependencyEntry,
  type SearchModel,
  isActivityModel,
} from "metabase-types/api";

import { SearchModelPicker } from "./SearchModelPicker";
import { BROWSE_OPTION_VALUE } from "./constants";
import { getSelectOptions } from "./utils";

type EntrySearchInputProps = {
  searchModels: SearchModel[];
  isGraphFetching: boolean;
  showModelPicker?: boolean;
  onEntryChange: (entry: DependencyEntry) => void;
  onSearchModelsChange: (searchModels: SearchModel[]) => void;
  onPickerOpen: () => void;
};

export function EntrySearchInput({
  searchModels,
  isGraphFetching,
  showModelPicker = true,
  onEntryChange,
  onSearchModelsChange,
  onPickerOpen,
}: EntrySearchInputProps) {
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery] = useDebouncedValue(
    searchValue.trim(),
    SEARCH_DEBOUNCE_DURATION,
  );
  const isSearchEnabled = searchQuery.length > 0;

  const { data: recentItems } = useListRecentsQuery(
    {
      context: ["selections"],
    },
    {
      skip: isSearchEnabled,
    },
  );

  const { data: searchResponse, isFetching: isSearchFetching } = useSearchQuery(
    {
      q: searchQuery,
      models: searchModels,
    },
    {
      skip: !isSearchEnabled,
    },
  );

  const [logRecentItem] = useLogRecentItemMutation();

  const searchOptions = useMemo(
    () =>
      getSelectOptions(
        searchResponse?.data ?? [],
        recentItems ?? [],
        searchModels,
        isSearchEnabled,
      ),
    [searchResponse, recentItems, searchModels, isSearchEnabled],
  );

  const handleChange = (value: string | null) => {
    const option = searchOptions.find((option) => option.value === value);
    if (option == null) {
      return;
    }
    if (option.entry != null) {
      onEntryChange(option.entry);

      if (option.model != null && isActivityModel(option.model)) {
        logRecentItem({
          model: option.model,
          model_id: option.entry.id,
        });
      }
    }
    if (option.value === BROWSE_OPTION_VALUE) {
      onPickerOpen();
    }
  };

  return (
    <Select
      value={null}
      data={searchOptions}
      searchValue={searchValue}
      placeholder={t`Pick an item to see its dependencies`}
      filter={({ options }) => options}
      leftSection={<FixedSizeIcon name="search" />}
      rightSection={
        isSearchFetching || isGraphFetching ? (
          <Loader size="sm" />
        ) : showModelPicker ? (
          <SearchModelPicker
            searchModels={searchModels}
            onSearchModelsChange={onSearchModelsChange}
          />
        ) : undefined
      }
      renderOption={({ option }) => (
        <DefaultSelectItem
          {...option}
          fw={option.value === BROWSE_OPTION_VALUE ? "bold" : undefined}
        />
      )}
      w="20rem"
      searchable
      autoFocus={!isGraphFetching}
      data-testid="graph-entry-search-input"
      onChange={handleChange}
      onSearchChange={setSearchValue}
    />
  );
}
