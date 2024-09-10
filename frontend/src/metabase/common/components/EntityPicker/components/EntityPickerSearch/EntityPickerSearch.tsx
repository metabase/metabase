import { useLayoutEffect, useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { useSearchQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { VirtualizedList } from "metabase/components/VirtualizedList";
import { NoObjectError } from "metabase/components/errors/NoObjectError";
import { trackSearchClick } from "metabase/search/analytics";
import { Box, Flex, Icon, Stack, TextInput } from "metabase/ui";
import type {
  SearchModel,
  SearchRequest,
  SearchResult,
  SearchResultId,
} from "metabase-types/api";

import type { TypeWithModel } from "../../types";
import { DelayedLoadingSpinner } from "../LoadingSpinner";
import { ChunkyList, ResultItem } from "../ResultItem";

const defaultSearchFilter = (results: SearchResult[]) => results;

export function EntityPickerSearchInput({
  models,
  placeholder,
  searchFilter = defaultSearchFilter,
  searchParams = {},
  searchQuery,
  setSearchQuery,
  setSearchResults,
}: {
  models: SearchModel[];
  placeholder: string;
  searchFilter?: (results: SearchResult[]) => SearchResult[];
  searchParams?: Partial<SearchRequest>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[] | null) => void;
}) {
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery);
  useDebounce(() => setDebouncedSearchQuery(searchQuery), 200, [searchQuery]);

  const { data, isFetching } = useSearchQuery(
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
    if (data && !isFetching) {
      setSearchResults(searchFilter(data.data));
    } else {
      setSearchResults(null);
    }
  }, [data, isFetching, searchFilter, setSearchResults]);

  return (
    <TextInput
      type="search"
      icon={<Icon name="search" size={16} />}
      miw={400}
      mr="2rem"
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value ?? "")}
      placeholder={placeholder}
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
}: {
  searchResults: SearchResult[] | null;
  onItemSelect: (item: Item) => void;
  selectedItem: Item | null;
}) => {
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
