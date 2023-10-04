import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { PLUGIN_MODERATION } from "metabase/plugins";

import EmptyState from "metabase/components/EmptyState";
import Search from "metabase/entities/search";
import SelectList from "metabase/components/SelectList";
import { DEFAULT_SEARCH_LIMIT } from "metabase/lib/constants";
import PaginationControls from "metabase/components/PaginationControls";
import { usePagination } from "metabase/hooks/use-pagination";

import {
  EmptyStateContainer,
  QuestionListItem,
  PaginationControlsContainer,
} from "./QuestionList.styled";

QuestionList.propTypes = {
  searchText: PropTypes.string,
  collectionId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  hasCollections: PropTypes.bool,
};

export function QuestionList({
  searchText,
  collectionId,
  onSelect,
  hasCollections,
}) {
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

  let query = isSearching
    ? { q: trimmedSearchText }
    : { collection: collectionId };

  query = {
    ...query,
    models: ["card", "dataset"],
    offset: queryOffset,
    limit: DEFAULT_SEARCH_LIMIT,
  };

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
      {({ list, metadata }) => {
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
                    item.moderated_status,
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
