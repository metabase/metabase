import { useEffect, useState } from "react";
import { t } from "ttag";
import { push } from "react-router-redux";
import { useDebounce } from "react-use";
import { useListKeyboardNavigation } from "metabase/hooks/use-list-keyboard-navigation";
import { SearchResult } from "metabase/search/components/SearchResult/SearchResult";
import EmptyState from "metabase/components/EmptyState";
import type { SearchFilters } from "metabase/search/types";
import {
  DEFAULT_SEARCH_LIMIT,
  SEARCH_DEBOUNCE_DURATION,
} from "metabase/lib/constants";
import { useSearchListQuery } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import Search from "metabase/entities/search";
import { Loader, Text, Stack } from "metabase/ui";
import type {
  SearchResults as SearchResultsType,
  CollectionItem,
  SearchModelType,
} from "metabase-types/api";
import {
  EmptyStateContainer,
  SearchResultsList,
} from "metabase/nav/components/search/SearchResults/SearchResults.styled";

export type SearchResultsProps = {
  onEntitySelect?: (result: any) => void;
  forceEntitySelect?: boolean;
  searchText?: string;
  searchFilters?: SearchFilters;
  models?: SearchModelType[];
  footerComponent?:
    | ((metadata: Omit<SearchResultsType, "data">) => JSX.Element | null)
    | null;
};

export const SearchResults = ({
  onEntitySelect,
  forceEntitySelect = false,
  searchText,
  searchFilters = {},
  models,
  footerComponent,
}: SearchResultsProps) => {
  const dispatch = useDispatch();

  const [debouncedSearchText, setDebouncedSearchText] = useState<string>();
  const isWaitingForDebounce = searchText !== debouncedSearchText;

  useDebounce(
    () => {
      setDebouncedSearchText(searchText);
    },
    SEARCH_DEBOUNCE_DURATION,
    [searchText],
  );

  const query = {
    q: debouncedSearchText,
    limit: DEFAULT_SEARCH_LIMIT,
    ...searchFilters,
    models: models ?? searchFilters.type,
  };

  const {
    data: list = [],
    metadata,
    isLoading,
  } = useSearchListQuery({
    query,
    reload: true,
    enabled: !!debouncedSearchText,
  });

  const { reset, getRef, cursorIndex } = useListKeyboardNavigation<
    CollectionItem,
    HTMLLIElement
  >({
    list,
    onEnter: onEntitySelect
      ? item => onEntitySelect(Search.wrapEntity(item, dispatch))
      : item => dispatch(push(item.getUrl())),
    resetOnListChange: false,
  });

  useEffect(() => {
    reset();
  }, [searchText, reset]);

  const hasResults = list.length > 0;
  const showFooter = hasResults && footerComponent && metadata;

  if (isLoading || isWaitingForDebounce) {
    return (
      <Stack p="xl" align="center">
        <Loader size="lg" data-testid="loading-spinner" />
        <Text size="xl" color="text.0">
          {t`Loading…`}
        </Text>
      </Stack>
    );
  }

  return (
    <>
      <SearchResultsList data-testid="search-results-list">
        {hasResults ? (
          list.map((item, index) => {
            const isIndexedEntity = item.model === "indexed-entity";
            const onClick =
              onEntitySelect && (isIndexedEntity || forceEntitySelect)
                ? onEntitySelect
                : undefined;
            const ref = getRef(item);
            const wrappedResult = Search.wrapEntity(item, dispatch);

            return (
              <li key={`${item.model}:${item.id}`} ref={ref}>
                <SearchResult
                  result={wrappedResult}
                  compact={true}
                  isSelected={cursorIndex === index}
                  onClick={onClick}
                />
              </li>
            );
          })
        ) : (
          <EmptyStateContainer>
            <EmptyState message={t`Didn't find anything`} icon="search" />
          </EmptyStateContainer>
        )}
      </SearchResultsList>
      {showFooter && footerComponent(metadata)}
    </>
  );
};
