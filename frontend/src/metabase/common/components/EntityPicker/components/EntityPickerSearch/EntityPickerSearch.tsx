import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import { VirtualizedList } from "metabase/components/VirtualizedList";
import { NoObjectError } from "metabase/components/errors/NoObjectError";
import Search from "metabase/entities/search";
import { useDebouncedEffectWithCleanup } from "metabase/hooks/use-debounced-effect";
import { defer } from "metabase/lib/promise";
import { useDispatch } from "metabase/lib/redux";
import { SearchLoadingSpinner } from "metabase/nav/components/search/SearchResults";
import type { WrappedResult } from "metabase/search/types";
import { Box, Flex, Icon, Stack, Tabs, TextInput } from "metabase/ui";
import type {
  SearchModelType,
  SearchResultId,
  SearchResponse,
} from "metabase-types/api";

import type { TypeWithModel } from "../../types";

import { EntityPickerSearchResult } from "./EntityPickerSearch.styled";
import { getSearchTabText } from "./utils";

const defaultSearchFilter = <
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  results: Item[],
) => results;

export function EntityPickerSearchInput<
  Id extends SearchResultId,
  Model extends SearchModelType,
  Item extends TypeWithModel<Id, Model>,
>({
  searchQuery,
  setSearchQuery,
  setSearchResults,
  models,
  searchFilter = defaultSearchFilter,
}: {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: Item[] | null) => void;
  models: string[];
  searchFilter?: (results: Item[]) => Item[];
}) {
  const dispatch = useDispatch();
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
            .list({ models, q: searchQuery }, dispatch)
            .then((results: SearchResponse<Id, Model, Item>) => {
              if (results.data) {
                const items = results.data;
                const filteredResults = searchFilter(items);
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
    [searchQuery, models, searchFilter, dispatch],
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

export const EntityPickerSearchResults = <
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  searchResults,
  onItemSelect,
  selectedItem,
}: {
  searchResults: Item[] | null;
  onItemSelect: (item: Item) => void;
  selectedItem: Item | null;
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
                  onItemSelect(item as unknown as Item);
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
            illustrationElement={<NoObjectError mb="-1.5rem" />}
          />
        </Flex>
      )}
    </Box>
  );
};

export const EntityPickerSearchTab = <
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  searchResults,
  searchQuery,
}: {
  searchResults: Item[] | null;
  searchQuery: string;
}) => (
  <Tabs.Tab key="search" value="search" icon={<Icon name="search" />}>
    {getSearchTabText(searchResults, searchQuery)}
  </Tabs.Tab>
);
