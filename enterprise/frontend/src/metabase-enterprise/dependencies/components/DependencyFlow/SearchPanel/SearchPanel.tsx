import { useDebouncedValue } from "@mantine/hooks";
import { useState } from "react";

import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { type IconName, Select, type SelectOption } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type {
  RecentItem,
  SearchModel,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

const SEARCH_MODELS: SearchModel[] = ["table", "card", "dataset", "metric"];
const SEARCH_LIMIT = 10;

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, SEARCH_DEBOUNCE_DURATION);
  const isSearch = debouncedQuery.length > 0;
  const { data: recentItems = [] } = useListRecentsQuery(
    {},
    { skip: isSearch },
  );
  const { data: searchItems } = useSearchQuery(
    {
      q: debouncedQuery,
      models: SEARCH_MODELS,
      limit: SEARCH_LIMIT,
    },
    {
      skip: !isSearch,
    },
  );
  const options = isSearch
    ? getSearchOptions(searchItems?.data ?? [])
    : getRecentOptions(recentItems);

  return (
    <Select
      data={options}
      value=""
      searchValue={query}
      searchable
      w={312}
      filter={({ options }) => options}
      placeholder="Search for an item to focus on"
      nothingFoundMessage="No items found"
      onSearchChange={setQuery}
    />
  );
}

function getValue(id: SearchResultId, model: SearchModel) {
  return `${model}/${id}`;
}

function getIcon(item: RecentItem | SearchResult): IconName {
  switch (item.model) {
    case "table":
      return "table";
    case "card":
      return (
        (item.display != null
          ? visualizations.get(item.display)?.iconName
          : undefined) ?? "table2"
      );
    case "dataset":
      return "model";
    case "metric":
      return "metric";
    default:
      return "unknown";
  }
}

function getRecentOptions(recentItems: RecentItem[]): SelectOption[] {
  return recentItems
    .filter((item) => SEARCH_MODELS.includes(item.model))
    .map((item) => ({
      value: getValue(item.id, item.model),
      label: item.model === "table" ? item.display_name : item.name,
      icon: getIcon(item),
    }));
}

function getSearchOptions(searchItems: SearchResult[]): SelectOption[] {
  return searchItems.map((item) => ({
    value: getValue(item.id, item.model),
    label: item.name,
    icon: getIcon(item),
  }));
}
