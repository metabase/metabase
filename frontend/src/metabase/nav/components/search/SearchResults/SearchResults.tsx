import type { JSX, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { skipToken, useSearchQuery } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState";
import { SearchResult } from "metabase/common/components/SearchResult/SearchResult";
import { SAMPLE_SEARCH_RESULTS } from "metabase/common/components/SearchResult/sample-search-results";
import {
  LoadingSkeleton,
  type LoadingSkeletonProps,
  MeasuredSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import { useListKeyboardNavigation } from "metabase/common/hooks/use-list-keyboard-navigation";
import type { SearchFilters } from "metabase/common/search/types";
import { navigate } from "metabase/router";
import { Box, Flex, Skeleton, Stack, rem } from "metabase/ui";
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

import S from "./SearchResults.module.css";

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

const SEARCH_RESULTS_SKELETON_ROWS = 6;

// As many sample rows as the hand-drawn skeleton draws.
const SAMPLE_DROPDOWN_RESULTS = SAMPLE_SEARCH_RESULTS.slice(
  0,
  SEARCH_RESULTS_SKELETON_ROWS,
);

/** Search or recents result rows: an icon, a title, and a secondary line. */
export const SearchResultsSkeleton = ({
  rows = SEARCH_RESULTS_SKELETON_ROWS,
  ...props
}: Omit<LoadingSkeletonProps, "children"> & { rows?: number }) => (
  <LoadingSkeleton gap={0} {...props}>
    {Array.from({ length: rows }, (_, index) => (
      <Flex key={index} align="center" gap="0.75rem" p="sm">
        <Skeleton h={rem(32)} w={rem(32)} radius="xs" flex="none" />
        <Stack gap="xs" flex={1}>
          <Skeleton h={14} w={getSkeletonLineWidth(index)} radius="xs" />
          <Skeleton h={10} w={getSkeletonLineWidth(index + 3)} radius="xs" />
        </Stack>
      </Flex>
    ))}
  </LoadingSkeleton>
);

export const EmptyStateContainer = ({
  children,
  "data-testid": dataTestId,
}: {
  children: ReactNode;
  "data-testid"?: string;
}) => (
  <Box mt={rem(64)} mb="xxl" data-testid={dataTestId}>
    {children}
  </Box>
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
        navigate(modelToUrl(item));
      }
    }
  };

  const { reset, getRef, cursorIndex } = useListKeyboardNavigation<
    ItemType,
    HTMLElement
  >({
    list: dropdownItemList,
    onEnter: onEnterSelect,
    resetOnListChange: false,
  });

  useEffect(() => {
    reset();
  }, [searchText, reset]);

  const isLoadingResults = isLoading || isWaitingForDebounce;

  if (!isLoadingResults && !hasResults) {
    return (
      <EmptyStateContainer data-testid="search-results-empty-state">
        <EmptyState message={t`Didn't find anything`} icon="search" />
      </EmptyStateContainer>
    );
  }

  return (
    <Stack
      className={S.searchResultsList}
      data-testid={isLoadingResults ? undefined : "search-results-list"}
      gap={0}
    >
      <Box p="sm" className={S.resultsContainer}>
        <MeasuredSkeleton
          loading={isLoadingResults}
          id="search-results"
          classic={<SearchResultsSkeleton />}
        >
          {isLoadingResults ? (
            <SearchResultsList
              results={SAMPLE_DROPDOWN_RESULTS}
              context={context}
            />
          ) : (
            <SearchResultsList
              results={list}
              context={context}
              searchTerm={searchText}
              cursorIndex={cursorIndex}
              getRef={getRef}
              onEntitySelect={onEntitySelect}
              forceEntitySelect={forceEntitySelect}
            />
          )}
        </MeasuredSkeleton>
      </Box>
      {!isLoadingResults && showFooter && (
        <Box ref={getRef(footerComponent)}>
          {footerComponent({
            metadata,
            isSelected: cursorIndex === dropdownItemList.length - 1,
          })}
        </Box>
      )}
    </Stack>
  );
};

type SearchResultsListProps = {
  results: SearchResultType[];
  context: SearchContext;
  searchTerm?: string;
  cursorIndex?: number | null;
  getRef?: (
    item: SearchResultType,
  ) => ((element: HTMLElement | null) => void) | undefined;
  onEntitySelect?: (result: SearchResultType) => void;
  forceEntitySelect?: boolean;
};

const SearchResultsList = ({
  results,
  context,
  searchTerm,
  cursorIndex,
  getRef,
  onEntitySelect,
  forceEntitySelect = false,
}: SearchResultsListProps) => (
  <Box component="ul">
    {results.map((item, index) => {
      const isIndexedEntity = item.model === "indexed-entity";
      const onClick =
        onEntitySelect && (isIndexedEntity || forceEntitySelect)
          ? onEntitySelect
          : undefined;

      return (
        <li key={`${item.model}:${item.id}`} ref={getRef?.(item)}>
          <SearchResult
            result={item}
            compact={true}
            showDescription={true}
            isSelected={cursorIndex === index}
            onClick={onClick}
            index={index}
            context={context}
            searchTerm={searchTerm}
          />
        </li>
      );
    })}
  </Box>
);
