import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useListCollectionItemsQuery,
  useSearchQuery,
} from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { PaginationControls } from "metabase/components/PaginationControls";
import SelectList from "metabase/components/SelectList";
import type { BaseSelectListItemProps } from "metabase/components/SelectList/BaseSelectListItem";
import Search from "metabase/entities/search";
import { isEmbeddingSdk } from "metabase/env";
import { usePagination } from "metabase/hooks/use-pagination";
import { DEFAULT_SEARCH_LIMIT } from "metabase/lib/constants";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_MODERATION } from "metabase/plugins";
import type { CollectionId } from "metabase-types/api";

import {
  EmptyStateContainer,
  PaginationControlsContainer,
  QuestionListItem,
} from "./QuestionList.styled";

interface QuestionListProps {
  searchText: string;
  collectionId: CollectionId;
  onSelect: BaseSelectListItemProps["onSelect"];
  hasCollections: boolean;
  showOnlyPublicCollections: boolean;
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

  const trimmedSearchText = searchText.trim();
  const isSearching = !!trimmedSearchText;

  const handleClickNextPage = () => {
    setQueryOffset(queryOffset + DEFAULT_SEARCH_LIMIT);
    handleNextPage();
  };

  const handleClickPreviousPage = () => {
    setQueryOffset(queryOffset - DEFAULT_SEARCH_LIMIT);
    handlePreviousPage();
  };

  const {
    data: searchData,
    error: searchError,
    isFetching: searchIsFetching,
  } = useSearchQuery(
    isSearching
      ? {
          q: trimmedSearchText,
          ...(showOnlyPublicCollections && {
            filter_items_in_personal_collection: "exclude" as const,
          }),
          models: isEmbeddingSdk // FIXME(sdk): remove this logic when v51 is released
            ? ["card", "dataset"] // ignore "metric" as SDK is used with v50 (or below) now, where we don't have this entity type
            : ["card", "dataset", "metric"],
          offset: queryOffset,
          limit: DEFAULT_SEARCH_LIMIT,
        }
      : skipToken,
  );
  const {
    data: itemsData,
    error: itemsError,
    isFetching: itemsIsFetching,
  } = useListCollectionItemsQuery(
    !isSearching
      ? {
          id: collectionId,
          models: isEmbeddingSdk // FIXME(sdk): remove this logic when v51 is released
            ? ["card", "dataset"] // ignore "metric" as SDK is used with v50 (or below) now, where we don't have this entity type
            : ["card", "dataset", "metric"],
          offset: queryOffset,
          limit: DEFAULT_SEARCH_LIMIT,
        }
      : skipToken,
  );
  const data = isSearching ? searchData : itemsData;
  const error = isSearching ? searchError : itemsError;
  const isFetching = isSearching ? searchIsFetching : itemsIsFetching;
  const dispatch = useDispatch();
  const list = useMemo(() => {
    return data?.data?.map(item => Search.wrapEntity(item, dispatch)) ?? [];
  }, [data, dispatch]);

  if (collectionId === "personal" && !searchText) {
    return null;
  }

  if (error || isFetching) {
    return <LoadingAndErrorWrapper error={error} loading={isFetching} />;
  }

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
          total={data?.total}
          itemsLength={list.length}
          page={page}
          pageSize={DEFAULT_SEARCH_LIMIT}
          onNextPage={handleClickNextPage}
          onPreviousPage={handleClickPreviousPage}
        />
      </PaginationControlsContainer>
    </>
  );
}
