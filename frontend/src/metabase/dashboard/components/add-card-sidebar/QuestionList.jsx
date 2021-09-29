import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { PLUGIN_MODERATION } from "metabase/plugins";

import EmptyState from "metabase/components/EmptyState";
import Search from "metabase/entities/search";
import { SelectList } from "metabase/components/select-list";

import { EmptyStateContainer, QuestionListItem } from "./QuestionList.styled";

QuestionList.propTypes = {
  searchText: PropTypes.string,
  collectionId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  hasCollections: PropTypes.bool,
};

const SEARCH_LIMIT = 1000;

export function QuestionList({
  searchText,
  collectionId,
  onSelect,
  hasCollections,
}) {
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
    models: "card",
    limit: SEARCH_LIMIT,
  };

  return (
    <Search.ListLoader entityQuery={query} wrapped>
      {({ list }) => {
        const shouldShowEmptyState =
          list.length === 0 && (isSearching || !hasCollections);
        if (shouldShowEmptyState) {
          return (
            <EmptyStateContainer>
              <EmptyState message={t`Nothing here`} icon="all" />
            </EmptyStateContainer>
          );
        }

        return (
          <SelectList>
            {list.map(item => (
              <QuestionListItem
                key={item.id}
                id={item.id}
                name={item.getName()}
                icon={item.getIcon().name}
                onSelect={onSelect}
                rightIcon={PLUGIN_MODERATION.getStatusIcon(
                  item.moderated_status,
                )}
              />
            ))}
          </SelectList>
        );
      }}
    </Search.ListLoader>
  );
}
