import { useEffect, useMemo, useState } from "react";
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
  ResultsContainer,
  ResultsFooter,
  SearchResultsList,
} from "metabase/nav/components/search/SearchResults/SearchResults.styled";

export type SearchResultsFooter =
  | (({
      metadata,
      isSelected,
    }: {
      metadata: Omit<SearchResultsType, "data">;
      isSelected?: boolean;
    }) => JSX.Element | null)
  | null;

export type SearchResultsProps = {
  onEntitySelect?: (result: any) => void;
  forceEntitySelect?: boolean;
  searchText?: string;
  searchFilters?: SearchFilters;
  models?: SearchModelType[];
  footerComponent?: SearchResultsFooter;
  onFooterSelect?: () => void;
};

export const SearchLoadingSpinner = () => (
  <Stack p="xl" align="center">
    <Loader size="lg" data-testid="loading-spinner" />
    <Text size="xl" color="text.0">
      {t`Loading…`}
    </Text>
  </Stack>
);

export const SearchResults = ({
  onEntitySelect,
  forceEntitySelect = false,
  searchText,
  searchFilters = {},
  models,
  footerComponent,
  onFooterSelect,
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

  const hasResults = list.length > 0;
  const showFooter = hasResults && footerComponent && metadata;

  const dropdownItemList = useMemo(() => {
    return showFooter ? [...list, footerComponent] : list;
  }, [footerComponent, list, showFooter]);

  const onEnterSelect = (item?: CollectionItem | SearchResultsFooter) => {
    if (showFooter && cursorIndex === dropdownItemList.length - 1) {
      onFooterSelect?.();
    }

    if (item && typeof item !== "function") {
      if (onEntitySelect) {
        onEntitySelect(Search.wrapEntity(item, dispatch));
      } else if (item && item.getUrl) {
        dispatch(push(item.getUrl()));
      }
    }
  };

  const { reset, getRef, cursorIndex } = useListKeyboardNavigation<
    CollectionItem | SearchResultsProps["footerComponent"],
    HTMLLIElement
  >({
    list: dropdownItemList,
    onEnter: onEnterSelect,
    resetOnListChange: false,
  });

  useEffect(() => {
    reset();
  }, [searchText, reset]);

  if (isLoading || isWaitingForDebounce) {
    return <SearchLoadingSpinner />;
  }

  return hasResults ? (
    <SearchResultsList data-testid="search-results-list" spacing={0}>
      <ResultsContainer>
        {list.map((item, index) => {
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
                showDescription={true}
                isSelected={cursorIndex === index}
                onClick={onClick}
              />
            </li>
          );
        })}
      </ResultsContainer>
      {showFooter && (
        <ResultsFooter ref={getRef(footerComponent)}>
          {footerComponent({
            metadata,
            isSelected: cursorIndex === dropdownItemList.length - 1,
          })}
        </ResultsFooter>
      )}
    </SearchResultsList>
  ) : (
    <EmptyStateContainer data-testid="search-results-empty-state">
      <EmptyState message={t`Didn't find anything`} icon="search" />
    </EmptyStateContainer>
  );
};
