import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import Search from "metabase/entities/search";

import { QuestionPickerItem } from "./QuestionPickerItem";

import { EmptyStateContainer } from "./QuestionList.styled";

QuestionList.propTypes = {
  searchText: PropTypes.string,
  collectionId: PropTypes.number,
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
    models: "card",
  };

  return (
    <Search.ListLoader entityQuery={query} wrapped>
      {({ list }) => {
        if (list.length === 0 && (isSearching || !hasCollections)) {
          return (
            <EmptyStateContainer>
              <EmptyState
                message={t`No questions have been found.`}
                icon="search"
              />
            </EmptyStateContainer>
          );
        }

        return (
          <ul>
            {list.map(item => {
              return (
                <QuestionPickerItem
                  key={item.id}
                  id={item.id}
                  name={item.getName()}
                  icon={item.getIcon()}
                  onSelect={onSelect}
                />
              );
            })}
          </ul>
        );
      }}
    </Search.ListLoader>
  );
}
