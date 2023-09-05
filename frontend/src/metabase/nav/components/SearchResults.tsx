import type { LegacyRef } from "react";
import { useEffect } from "react";
import { t } from "ttag";
import { push } from "react-router-redux";
import { useListKeyboardNavigation } from "metabase/hooks/use-list-keyboard-navigation";
import { SearchResult } from "metabase/search/components/SearchResult";
import { EmptyStateContainer } from "metabase/nav/components/SearchResults.styled";
import EmptyState from "metabase/components/EmptyState";
import type { SearchFilters } from "metabase/search/types";
import { DEFAULT_SEARCH_LIMIT } from "metabase/lib/constants";
import { useSearchListQuery } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import Search from "metabase/entities/search";
import { Loader, Text, Stack } from "metabase/ui";

type SearchResultsProps = {
  onChangeLocation: () => void;
  onEntitySelect?: () => void;
  forceEntitySelect: boolean;
  searchText: string;
  searchFilters: SearchFilters;
};

export const SearchResults = ({
  onEntitySelect,
  forceEntitySelect,
  searchText,
  searchFilters,
}: SearchResultsProps) => {
  const dispatch = useDispatch();

  const query = {
    q: searchText,
    limit: DEFAULT_SEARCH_LIMIT,
    ...searchFilters,
    models: searchFilters.type,
  };

  const { data: list = [], isLoading } = useSearchListQuery({
    query,
    reload: true,
  });

  const { reset, getRef, cursorIndex } = useListKeyboardNavigation({
    list,
    onEnter: onEntitySelect
      ? onEntitySelect
      : item => dispatch(push(item.getUrl())),
    resetOnListChange: false,
  });

  useEffect(() => {
    reset();
  }, [searchText, reset]);

  const hasResults = list.length > 0;

  return isLoading ? (
    <Stack p="xl" align="center">
      <Loader size="lg" />
      <Text color="dimmed" size="xl">
        Loading…
      </Text>
    </Stack>
  ) : (
    <ul data-testid="search-results-list">
      {hasResults ? (
        list.map((item, index) => {
          const isIndexedEntity = item.model === "indexed-entity";
          const onClick =
            onEntitySelect && (isIndexedEntity || forceEntitySelect)
              ? onEntitySelect
              : undefined;
          const ref = getRef(item) as LegacyRef<HTMLLIElement> | undefined;
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
