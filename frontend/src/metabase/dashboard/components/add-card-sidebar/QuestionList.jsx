import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { PLUGIN_MODERATION } from "metabase/plugins";

import EmptyState from "metabase/components/EmptyState";
import Search from "metabase/entities/search";
import { SelectList } from "metabase/components/select-list";
import { DEFAULT_SEARCH_LIMIT } from "metabase/lib/constants";

import { EmptyStateContainer, QuestionListItem } from "./QuestionList.styled";

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
    limit: DEFAULT_SEARCH_LIMIT,
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
        );
      }}
    </Search.ListLoader>
  );
}
