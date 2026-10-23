import { useCallback, useMemo } from "react";
import { pick } from "underscore";

import { skipToken, useSearchQuery } from "metabase/api";
import { trackSearchClick } from "metabase/common/search/analytics";
import { Stack } from "metabase/ui";
import {
  SEARCH_MODELS,
  type SchemaName,
  type SearchModel,
  type SearchRequest,
  type SearchResult,
} from "metabase-types/api";

import { useOmniPickerContext } from "../../context";
import { useCurrentSearchScope } from "../../hooks/use-current-search-scope";
import type { OmniPickerItem } from "../../types";

import {
  type CustomSearchResult,
  SearchResults,
  SearchScopeSelector,
} from "./SearchResults";

const makeIntoPickerItem = (
  item: SearchResult,
  searchParams?: Partial<SearchRequest>,
): OmniPickerItem => {
  const isGuaranteedPersonal =
    searchParams?.filter_items_in_personal_collection === "only";
  const isGuaranteedNotPersonal =
    searchParams?.filter_items_in_personal_collection === "exclude";

  if (item.model === "table") {
    return {
      ...pick(item, ["id", "name", "collection", "database_id"]),
      model: "table",
      database_name: item.database_name ?? undefined,
      // Unjustified type cast. FIXME
      schema: item.table_schema as SchemaName,
    };
  }

  // Unjustified type cast. FIXME
  return {
    ...item,
    type: "type" in item ? item.type : item.collection_type,
    // search items don't have locations, so we can't tell from the item itself if it's in a personal collection
    // but if the searchParams are filtering to only personal collection items, we can assume it is
    is_personal:
      isGuaranteedPersonal || (isGuaranteedNotPersonal ? false : undefined),
  } as OmniPickerItem;
};

const useApiSearch = ({
  searchQuery,
  models,
  searchParams,
}: {
  models: OmniPickerItem["model"][];
  searchQuery?: string;
  searchParams?: Partial<SearchRequest>;
}) => {
  const searchScope = useCurrentSearchScope();

  const { searchCollection, searchModels } = useMemo(() => {
    if (searchScope === "databases") {
      // if we're searching the databases scope, only search for tables
      return {
        searchCollection: undefined,
        searchModels: ["table" as const],
      };
    }
    // Unjustified type cast. FIXME
    const searchModels = models.filter((model) =>
      // Unjustified type cast. FIXME
      SEARCH_MODELS.includes(model as SearchModel),
    ) as SearchModel[];
    if (searchScope === "all") {
      return {
        searchCollection: undefined,
        searchModels,
      };
    }
    return {
      searchCollection: searchScope || undefined,
      searchModels,
    };
  }, [searchScope, models]);

  const apiQuery: SearchRequest = useMemo(
    () => ({
      q: searchQuery || "",
      collection: searchCollection,
      models: searchModels,
      context: "entity-picker",
      limit: 50,
      calculate_available_models: true,
      ...(searchParams || {}),
    }),
    [searchQuery, searchCollection, searchModels, searchParams],
  );

  return useSearchQuery(apiQuery?.q?.length ? apiQuery : skipToken);
};

export const SearchResultsItemList = () => {
  const {
    models,
    searchQuery,
    customFolders,
    isHiddenItem,
    isDisabledItem,
    isSelectableItem,
    searchParams,
  } = useOmniPickerContext();
  const searchScope = useCurrentSearchScope();

  const customResults = useMemo((): CustomSearchResult[] => {
    const query = searchQuery?.toLowerCase() ?? "";
    // Custom items are in no collection or database, so a search scoped to one leaves them out.
    const isUnscoped = searchScope === null || searchScope === "all";
    if (query.length === 0 || !isUnscoped) {
      return [];
    }
    return (customFolders ?? []).flatMap((folder) =>
      folder.items
        .filter((item) => item.name.toLowerCase().includes(query))
        .map((item) => ({ folder, item })),
    );
  }, [customFolders, searchQuery, searchScope]);

  const {
    data: results,
    error,
    isFetching,
  } = useApiSearch({
    models,
    searchQuery,
    searchParams,
  });

  const filteredResults = useMemo(
    () =>
      results?.data
        ?.map((i) => makeIntoPickerItem(i, searchParams))
        .filter(
          // don't show something you can't pick at all
          (item) =>
            isSelectableItem(item) &&
            !isHiddenItem(item) &&
            !isDisabledItem(item),
        ) || [],
    [results, isHiddenItem, isDisabledItem, isSelectableItem, searchParams],
  );

  const onClick = useCallback(
    (item: OmniPickerItem, index: number) => {
      trackSearchClick({
        itemType: "item",
        position: index,
        context: "entity-picker",
        searchEngine: "unknown",
        entityModel: item.model,
        entityId: typeof item.id === "number" ? item.id : null,
        searchTerm: searchQuery,
      });
    },
    [searchQuery],
  );

  return (
    <Stack h="100%" w="40rem" gap={0}>
      <SearchScopeSelector />
      <SearchResults
        searchResults={filteredResults}
        customResults={customResults}
        isLoading={isFetching}
        error={error}
        onClick={onClick}
      />
    </Stack>
  );
};
