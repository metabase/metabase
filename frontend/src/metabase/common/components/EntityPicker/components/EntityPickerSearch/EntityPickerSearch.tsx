import { useEffect, useLayoutEffect, useState } from "react";
import { useDebounce } from "react-use";
import { msgid, ngettext, t } from "ttag";

import { useSearchQuery } from "metabase/api";
import type { PrototypeState } from "metabase/common/components/DataPicker";
import EmptyState from "metabase/components/EmptyState";
import { VirtualizedList } from "metabase/components/VirtualizedList";
import { NoObjectError } from "metabase/components/errors/NoObjectError";
import { trackSearchClick } from "metabase/search/analytics";
import {
  Box,
  Flex,
  Icon,
  SegmentedControl,
  Stack,
  Tabs,
  TextInput,
} from "metabase/ui";
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
}: {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: SearchResult[] | null) => void;
  models: SearchModel[];
  searchFilter?: (results: SearchResult[]) => SearchResult[];
  searchParams?: Partial<SearchRequest>;
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
      placeholder={t`Search…`}
    />
  );
}

export const EntityPickerSearchResults = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  searchResults: allSearchResults,
  onItemSelect,
  selectedItem,
  prototypeState,
}: {
  searchResults: SearchResult[] | null;
  onItemSelect: (item: Item) => void;
  selectedItem: Item | null;
  prototypeState?: PrototypeState;
}) => {
  const lastFolder = prototypeState?.lastFolder;
  const scopeName = prototypeState?.lastFolder?.name;
  const scopeValue = prototypeState?.lastFolder?.id;
  const [searchScope, setSearchScope] = useState<"*" | "scope">(
    scopeValue ? "scope" : "*",
  );

  if (!allSearchResults) {
    return <DelayedLoadingSpinner text={t`Loading…`} />;
  }

  const searchResults = allSearchResults.filter(result => {
    if (searchScope === "*" || !lastFolder) {
      return true;
    }

    if (lastFolder.model === "database") {
      return result.model === "table" && result.database_id === lastFolder.id;
    }

    if (lastFolder.model === "schema") {
      return result.model === "table" && result.table_schema === lastFolder.id;
    }

    if (lastFolder.model === "collection") {
      return result.collection?.id === lastFolder.id;
    }

    return true;
  });

  return (
    <Box h="100%" bg="bg-light">
      <Stack
        spacing="xl"
        pos="relative"
        h="100%"
        style={{ overflow: "hidden" }}
      >
        {searchResults.length > 0 && (
          <Flex justify="space-between" p="xl" pb={0}>
            <div>
              {scopeName && (
                <SegmentedControl
                  data={[
                    { label: "Everywhere", value: "*" },
                    { label: `“${scopeName}”`, value: "scope" },
                  ]}
                  value={searchScope}
                  onChange={value => setSearchScope(value as any)}
                />
              )}
            </div>

            <div>
              {ngettext(
                msgid`${searchResults.length} result`,
                `${searchResults.length} results`,
                searchResults.length,
              )}
            </div>
          </Flex>
        )}

        {searchResults.length > 0 ? (
          <Stack h="100%" bg="bg-light">
            <VirtualizedList
              Wrapper={({ children, ...props }) => (
                <Box p="xl" pt={0} pos="relative" h="100%" {...props}>
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
      </Stack>
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
