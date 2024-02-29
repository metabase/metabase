import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import EmptyState from "metabase/components/EmptyState";
import { VirtualizedList } from "metabase/components/VirtualizedList";
import Search from "metabase/entities/search";
import { useDebouncedEffectWithCleanup } from "metabase/hooks/use-debounced-effect";
import { defer } from "metabase/lib/promise";
import { useDispatch } from "metabase/lib/redux";
import { SearchLoadingSpinner } from "metabase/nav/components/search/SearchResults";
import type { WrappedResult } from "metabase/search/types";
import { Stack, Tabs, TextInput, Icon, Box, Flex } from "metabase/ui";
import type {
  SearchResult as SearchResultType,
  SearchResults as SearchResultsType,
} from "metabase-types/api";

import type { TypeWithModel } from "../../types";

import { EntityPickerSearchResult } from "./EntityPickerSearch.styled";
import { getSearchTabText } from "./utils";

const defaultSearchFilter = (results: SearchResultType[]) => results;

export function EntityPickerSearchInput({
  searchQuery,
  setSearchQuery,
  setSearchResults,
  models,
  searchFilter = defaultSearchFilter,
}: {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResultType[] | null) => void;
  models: string[];
  searchFilter?: (results: SearchResultType[]) => SearchResultType[];
}) {
  useDebouncedEffectWithCleanup(
    () => {
      const cancelled = defer();

      const searchFn = () => {
        if (searchQuery && !searchQuery.trim()) {
          setSearchResults([]);
          return;
        }

        if (searchQuery) {
          Search.api
            .list({ models, q: searchQuery }, { cancelled: cancelled.promise })
            .then((results: SearchResultsType) => {
              if (results.data) {
                const filteredResults = searchFilter(results.data);
                setSearchResults(filteredResults);
              } else {
                setSearchResults(null);
              }
            });
        } else {
          setSearchResults(null);
        }
      };

      const cleanup = () => {
        cancelled.resolve();
      };

      return [searchFn, cleanup];
    },
    200,
    [searchQuery, models, searchFilter],
  );

  return (
    <TextInput
      type="search"
      icon={<Icon name="search" size={16} />}
      miw={400}
      mr="2rem"
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value ?? "")}
      placeholder={t`Search…`}
    />
  );
}

export const EntityPickerSearchResults = <TItem extends TypeWithModel>({
  searchResults,
  onItemSelect,
  selectedItem,
}: {
  searchResults: SearchResultType[] | null;
  onItemSelect: (item: TItem) => void;
  selectedItem: TItem | null;
}) => {
  const dispatch = useDispatch();

  if (!searchResults) {
    return <SearchLoadingSpinner />;
  }

  return (
    <Box p="lg" h="100%">
      {searchResults.length > 0 ? (
        <Stack h="100%">
          <VirtualizedList>
            {searchResults?.map(item => (
              <EntityPickerSearchResult
                key={item.model + item.id}
                result={Search.wrapEntity(item, dispatch)}
                onClick={(item: WrappedResult) => {
                  onItemSelect(item as unknown as TItem);
                }}
                isSelected={
                  selectedItem?.id === item.id &&
                  selectedItem?.model === item.model
                }
              />
            ))}
          </VirtualizedList>
        </Stack>
      ) : (
        <Flex direction="column" justify="center" h="100%">
          <EmptyState
            title={t`Didn't find anything`}
            message={t`There weren't any results for your search.`}
            illustrationElement={
              <Box mb={"-2.5rem"}>
                <img src={NoResults} />
              </Box>
            }
          />
        </Flex>
      )}
    </Box>
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
    {getSearchTabText(searchResults, searchQuery)}
  </Tabs.Tab>
);
