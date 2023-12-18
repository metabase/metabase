import { t } from "ttag";
import { useDebouncedEffect } from "metabase/hooks/use-debounced-effect";
import { Stack, Tabs, TextInput } from "metabase/ui";
import { SearchResult } from "metabase/search/components/SearchResult";
import type {
  SearchResult as SearchResultType,
  SearchResults as SearchResultsType,
} from "metabase-types/api";
import type { WrappedResult } from "metabase/search/types";

import { useDispatch } from "metabase/lib/redux";
import { Icon } from "metabase/core/components/Icon";

import Search from "metabase/entities/search";
import { SearchLoadingSpinner } from "metabase/nav/components/search/SearchResults";

export function EntityPickerSearchInput({
  searchQuery,
  setSearchQuery,
  setSearchResults,
  models,
}: {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResultType[] | null) => void;
  models: string[];
}) {
  useDebouncedEffect(
    () => {
      if (searchQuery) {
        Search.api
          .list({ models, q: searchQuery })
          .then((results: SearchResultsType) => {
            if (results.data) {
              setSearchResults(results.data);
            } else {
              setSearchResults(null);
            }
          });
      } else {
        setSearchResults(null);
      }
    },
    200,
    [searchQuery, models],
  );

  return (
    <TextInput
      type="search"
      icon={<Icon name="search" size={16} />}
      miw={400}
      mr="lg"
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value ?? "")}
      placeholder={t`Search…`}
    />
  );
}

export const EntityPickerSearchResults = ({
  searchResults,
  onItemSelect,
  selectedItem,
}: {
  searchResults: SearchResultType[] | null;
  onItemSelect: (item: WrappedResult) => void;
  selectedItem: SearchResultType | null;
}) => {
  const dispatch = useDispatch();

  if (!searchResults) {
    return <SearchLoadingSpinner />;
  }

  return (
    <Stack
      p="lg"
      style={{
        height: "100%",
        overflowY: "auto",
      }}
    >
      {searchResults?.map(item => (
        <SearchResult
          key={item.model + item.id}
          result={Search.wrapEntity(item, dispatch)}
          onClick={onItemSelect}
          isSelected={
            selectedItem?.id === item.id && selectedItem?.model === item.model
          }
        />
      ))}
    </Stack>
  );
};

export const EntityPickerSearchTab = ({
  searchResults,
  searchQuery,
}: {
  searchResults: SearchResultType[] | null;
  searchQuery: string;
}) => (
  <Tabs.Tab key="search" value="search" icon={<Icon name="search" />}>
    {searchResults
      ? t`${searchResults.length} results for "${searchQuery}"`
      : t`Search results`}
  </Tabs.Tab>
);
