import { useEffect, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { skipToken, useSearchQuery } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { SearchResult } from "metabase/common/components/SearchResult/SearchResult";
import { useListKeyboardNavigation } from "metabase/common/hooks/use-list-keyboard-navigation";
import type { SearchFilters } from "metabase/common/search/types";
import {
  EmptyStateContainer,
  ResultsContainer,
  ResultsFooter,
  SearchResultsList,
} from "metabase/nav/components/search/SearchResults/SearchResults.styled";
import { useDispatch } from "metabase/redux";
import { Loader } from "metabase/ui";
import { modelToUrl } from "metabase/urls";
import {
  DEFAULT_SEARCH_LIMIT,
  SEARCH_DEBOUNCE_DURATION,
} from "metabase/utils/constants";
import type {
  CollectionItem,
  SearchContext,
  SearchModel,
  SearchResult as SearchResultType,
  SearchResponse as SearchResultsType,
} from "metabase-types/api";

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
  models?: SearchModel[];
  footerComponent?: SearchResultsFooter;
  onFooterSelect?: () => void;
  context: SearchContext;
};

export const SearchLoadingSpinner = () => (
  <Loader size="lg" data-testid="loading-indicator" label={t`Loading…`} />
);

export const SearchResults = ({
  onEntitySelect,
  forceEntitySelect = false,
  searchText,
  searchFilters = {},
  models,
  footerComponent,
  onFooterSelect,
  context,
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

  const query: {
    q?: string;
    limit: number;
    models?: SearchModel[];
    context: SearchContext;
  } & SearchFilters = {
    q: debouncedSearchText,
    limit: DEFAULT_SEARCH_LIMIT,
    context,
    ...searchFilters,
    models: models ?? searchFilters.type,
  };

  const { data: response, isLoading } = useSearchQuery(
    debouncedSearchText ? query : skipToken,
    { refetchOnMountOrArgChange: true },
  );
  const list = useMemo(() => response?.data ?? [], [response?.data]);
  const metadata = useMemo<Omit<SearchResultsType, "data"> | undefined>(() => {
    if (!response) {
      return undefined;
    }
    const { data: _data, ...rest } = response;
    return rest;
  }, [response]);

  const hasResults = list.length > 0;
  const showFooter = hasResults && footerComponent && metadata;

  const dropdownItemList = useMemo(() => {
    return showFooter ? [...list, footerComponent] : list;
  }, [footerComponent, list, showFooter]);

  type ItemType =
    | CollectionItem
    | SearchResultsProps["footerComponent"]
    | SearchResultType;

  const onEnterSelect = (item?: ItemType) => {
    if (showFooter && cursorIndex === dropdownItemList.length - 1) {
      onFooterSelect?.();
    }

    if (item && typeof item !== "function") {
      if (onEntitySelect) {
        onEntitySelect(item);
      } else if (item && modelToUrl(item)) {
        dispatch(push(modelToUrl(item)));
      }
    }
  };

  const { reset, getRef, cursorIndex } = useListKeyboardNavigation<
    ItemType,
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
    <SearchResultsList data-testid="search-results-list" gap={0}>
      <ResultsContainer>
        {list.map((item, index) => {
          const isIndexedEntity = item.model === "indexed-entity";
          const onClick =
            onEntitySelect && (isIndexedEntity || forceEntitySelect)
              ? onEntitySelect
              : undefined;
          const ref = getRef(item);

          return (
            <li key={`${item.model}:${item.id}`} ref={ref}>
              <SearchResult
                result={item}
                compact={true}
                showDescription={true}
                isSelected={cursorIndex === index}
                onClick={onClick}
                index={index}
                context={context}
                searchTerm={searchText}
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
