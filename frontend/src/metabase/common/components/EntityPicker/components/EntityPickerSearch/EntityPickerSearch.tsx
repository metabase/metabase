import { useLayoutEffect, useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { useSearchQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { ErrorState } from "metabase/components/ErrorState";
import { VirtualizedList } from "metabase/components/VirtualizedList";
import { NoObjectError } from "metabase/components/errors/NoObjectError";
import { trackSearchClick } from "metabase/search/analytics";
import { Box, Flex, Icon, Image, Stack, Tabs, TextInput } from "metabase/ui";
import type {
  SearchModel,
  SearchRequest,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

import type { TypeWithModel } from "../../types";
import { DelayedLoadingSpinner } from "../LoadingSpinner";
import { ChunkyList, ResultItem } from "../ResultItem";

import { getSearchTabText } from "./utils";

const defaultSearchFilter = (results: SearchResult[]) => results;

export function EntityPickerSearchInput({
  searchQuery,
  setSearchQuery,
  setSearchResults,
  models,
  searchFilter = defaultSearchFilter,
  searchParams = {},
  setSearchError,
}: {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[] | null) => void;
  models: SearchModel[];
  searchFilter?: (results: SearchResult[]) => SearchResult[];
  searchParams?: Partial<SearchRequest>;
  setSearchError: (error: Error | null) => void;
}) {
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  useDebounce(() => setDebouncedSearchQuery(searchQuery), 200, [searchQuery]);

  const { data, isFetching, isError, error } = useSearchQuery(
    {
      q: debouncedSearchQuery,
      models,
      context: "entity-picker",
      ...searchParams,
    },
    {
      skip: !debouncedSearchQuery,
    },
  );

  useLayoutEffect(() => {
    if (isError) {
      setSearchError(error as Error);
      setSearchResults(null);
    } else if (data && !isFetching) {
      if (!Array.isArray(data.data)) {
        setSearchError(new Error(t`non json response`));
        setSearchResults(null);
      } else {
        setSearchResults(searchFilter(data.data));
        setSearchError(null);
      }
    } else {
      setSearchResults(null);
      setSearchError(null);
    }
  }, [
    data,
    isFetching,
    isError,
    error,
    searchFilter,
    setSearchResults,
    setSearchError,
  ]);

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
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  searchResults,
  onItemSelect,
  selectedItem,
  searchError,
}: {
  searchResults: SearchResult[] | null;
  onItemSelect: (item: Item) => void;
  selectedItem: Item | null;
  searchError: Error | null;
}) => {
  if (searchError) {
    return (
      <Box h="100%" bg="bg-light">
        <Flex direction="column" justify="center" h="100%">
          <ErrorState
            illustrationElement={
              <Image
                src="app/img/something_went_wrong_trees.svg"
                height={120}
              />
            }
            title={t`Something went wrong`}
          />
        </Flex>
      </Box>
    );
  }

  if (!searchResults) {
    return <DelayedLoadingSpinner text={t`Loading…`} />;
  }

  return (
    <Box h="100%" bg="bg-light">
      {searchResults.length > 0 ? (
        <Stack h="100%" bg="bg-light">
          <VirtualizedList
            Wrapper={({ children, ...props }) => (
              <Box p="xl" {...props}>
                <ChunkyList>{children}</ChunkyList>
              </Box>
            )}
          >
            {searchResults?.map((item, index) => (
              <ResultItem
                key={item.model + item.id}
                item={item}
                onClick={() => {
                  trackSearchClick("item", index, "entity-picker");
                  onItemSelect(item as unknown as Item);
                }}
                isSelected={
                  selectedItem?.id === item.id &&
                  selectedItem?.model === item.model
                }
                isLast={index === searchResults.length - 1}
              />
            ))}
          </VirtualizedList>
        </Stack>
      ) : searchError ? (
        <Flex direction="column" justify="center" h="100%">
          <EmptyState
            title={t`It's dead jim`}
            message={t`Not sure why, but the search errored`}
          />
        </Flex>
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

export const EntityPickerSearchTab = ({
  searchResults,
  searchQuery,
  onClick,
}: {
  searchResults: SearchResult[] | null;
  searchQuery: string;
  onClick: () => void;
}) => (
  <Tabs.Tab value="search" icon={<Icon name="search" />} onClick={onClick}>
    {getSearchTabText(searchResults, searchQuery)}
  </Tabs.Tab>
);
