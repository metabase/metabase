import { useState, useEffect } from "react";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import PaginationControls from "metabase/components/PaginationControls";
import SelectList from "metabase/components/SelectList";
import type { BaseSelectListItemProps } from "metabase/components/SelectList/BaseSelectListItem";
import Search from "metabase/entities/search";
import { usePagination } from "metabase/hooks/use-pagination";
import { DEFAULT_SEARCH_LIMIT } from "metabase/lib/constants";
import { PLUGIN_MODERATION } from "metabase/plugins";
import type {
  CollectionId,
  SearchRequest,
  SearchResult,
} from "metabase-types/api";
import type { WrappedEntity } from "metabase-types/entities";

import {
  EmptyStateContainer,
  QuestionListItem,
  PaginationControlsContainer,
} from "./QuestionList.styled";

interface QuestionListProps {
  searchText: string;
  collectionId: CollectionId;
  onSelect: BaseSelectListItemProps["onSelect"];
  hasCollections: boolean;
  showOnlyPublicCollections: boolean;
}

interface SearchListLoaderProps {
  list: WrappedEntity<SearchResult>[];
  metadata: {
    total: number;
  };
}

export function QuestionList({
  searchText,
  collectionId,
  onSelect,
  hasCollections,
  showOnlyPublicCollections,
}: QuestionListProps) {
  const [queryOffset, setQueryOffset] = useState(0);
  const { handleNextPage, handlePreviousPage, page, setPage } = usePagination();

  useEffect(() => {
    setQueryOffset(0);
    setPage(0);
  }, [searchText, collectionId, setPage]);

  if (collectionId === "personal" && !searchText) {
    return null;
  }

  const trimmedSearchText = searchText.trim();
  const isSearching = !!trimmedSearchText;

  const query = createQuery();

  function createQuery(): SearchRequest {
    const baseQuery = isSearching
      ? {
          q: trimmedSearchText,
          ...(showOnlyPublicCollections && {
            filter_items_in_personal_collection: "exclude" as const,
          }),
        }
      : { collection: collectionId };

    return {
      ...baseQuery,
      models: ["card", "dataset"],
      offset: queryOffset,
      limit: DEFAULT_SEARCH_LIMIT,
    };
  }

  const handleClickNextPage = () => {
    setQueryOffset(queryOffset + DEFAULT_SEARCH_LIMIT);
    handleNextPage();
  };

  const handleClickPreviousPage = () => {
    setQueryOffset(queryOffset - DEFAULT_SEARCH_LIMIT);
    handlePreviousPage();
  };

  return (
    <Search.ListLoader entityQuery={query} wrapped>
      {({ list, metadata }: SearchListLoaderProps) => {
        const shouldShowEmptyState =
          list.length === 0 && (isSearching || !hasCollections);
        if (shouldShowEmptyState) {
          return (
            <EmptyStateContainer>
              <EmptyState message={t`Nothing here`} icon="folder" />
            </EmptyStateContainer>
          );
        }

        return (
          <>
            <SelectList>
              {list.map(item => (
                <QuestionListItem
                  key={item.id}
                  id={item.id}
                  name={item.getName()}
                  icon={{
                    name: item.getIcon().name,
                    size: item.model === "dataset" ? 18 : 16,
                  }}
                  onSelect={onSelect}
                  rightIcon={PLUGIN_MODERATION.getStatusIcon(
                    item.moderated_status ?? undefined,
                  )}
                />
              ))}
            </SelectList>
            <PaginationControlsContainer>
              <PaginationControls
                showTotal
                total={metadata.total}
                itemsLength={list.length}
                page={page}
                pageSize={DEFAULT_SEARCH_LIMIT}
                onNextPage={handleClickNextPage}
                onPreviousPage={handleClickPreviousPage}
              />
            </PaginationControlsContainer>
          </>
        );
      }}
    </Search.ListLoader>
  );
}
