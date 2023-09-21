import { useEffect, useState } from "react";
import { t } from "ttag";
import { push } from "react-router-redux";
import { useDebounce } from "react-use";
import { useListKeyboardNavigation } from "metabase/hooks/use-list-keyboard-navigation";
import { SearchResult } from "metabase/search/components/SearchResult";
import { EmptyStateContainer } from "metabase/nav/components/SearchResults.styled";
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
import type { CollectionItem, SearchModelType } from "metabase-types/api";

type SearchResultsProps = {
  onEntitySelect?: (result: any) => void;
  forceEntitySelect?: boolean;
  searchText?: string;
  searchFilters?: SearchFilters;
  models?: SearchModelType[];
};

export const SearchResults = ({
  onEntitySelect,
  forceEntitySelect = false,
  searchText,
  searchFilters = {},
  models,
}: SearchResultsProps) => {
  const dispatch = useDispatch();

  const [debouncedSearchText, setDebouncedSearchText] = useState<string>();

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

  const { data: list = [], isLoading } = useSearchListQuery({
    query,
    reload: true,
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

  if (isLoading) {
    return (
      <Stack p="xl" align="center">
        <Loader size="lg" />
        <Text size="xl" color="text.0">
          {t`Loading…`}
        </Text>
      </Stack>
    );
  }

  return (
    <ul data-testid="search-results-list">
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
    </ul>
  );
};
