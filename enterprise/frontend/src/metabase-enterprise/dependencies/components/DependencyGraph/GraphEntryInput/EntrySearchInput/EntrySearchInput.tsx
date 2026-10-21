import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  useListRecentsQuery,
  useLogRecentItemMutation,
  useSearchQuery,
} from "metabase/api";
import { DefaultSelectItem, FixedSizeIcon, Loader, Select } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import { useDataApps } from "metabase-enterprise/dependencies/hooks/use-data-apps";
import { type DependencyEntry, isActivityModel } from "metabase-types/api";

import type { EntrySearchModel } from "../constants";

import { SearchModelPicker } from "./SearchModelPicker";
import { BROWSE_OPTION_VALUE } from "./constants";
import { getIndexedSearchModels, getSelectOptions } from "./utils";

type EntrySearchInputProps = {
  searchModels: EntrySearchModel[];
  isGraphFetching: boolean;
  onEntryChange: (entry: DependencyEntry) => void;
  onSearchModelsChange: (searchModels: EntrySearchModel[]) => void;
  onPickerOpen: () => void;
};

export function EntrySearchInput({
  searchModels,
  isGraphFetching,
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
  const indexedSearchModels = getIndexedSearchModels(searchModels);
  // an empty `models` list would search every model
  const isIndexSearchEnabled =
    isSearchEnabled && indexedSearchModels.length > 0;
  const isDataAppSearchWanted =
    isSearchEnabled && searchModels.includes("data-app");

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
      models: indexedSearchModels,
      context: "dependencies",
    },
    {
      skip: !isIndexSearchEnabled,
    },
  );

  const {
    data: dataApps,
    isFetching: isDataAppsFetching,
    hasDataApps,
  } = useDataApps({ skip: !isDataAppSearchWanted });
  const isDataAppSearchEnabled = isDataAppSearchWanted && hasDataApps;

  const [logRecentItem] = useLogRecentItemMutation();

  const searchOptions = useMemo(
    () =>
      getSelectOptions(
        // a skipped query still returns the data of its last run
        isIndexSearchEnabled ? (searchResponse?.data ?? []) : [],
        recentItems ?? [],
        isDataAppSearchEnabled ? (dataApps ?? []) : [],
        searchModels,
        searchQuery,
      ),
    [
      isIndexSearchEnabled,
      searchResponse,
      recentItems,
      isDataAppSearchEnabled,
      dataApps,
      searchModels,
      searchQuery,
    ],
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
        isSearchFetching || isDataAppsFetching || isGraphFetching ? (
          <Loader size="sm" />
        ) : (
          <SearchModelPicker
            searchModels={searchModels}
            onSearchModelsChange={onSearchModelsChange}
          />
        )
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
