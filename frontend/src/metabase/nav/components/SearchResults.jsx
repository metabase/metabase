import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { DEFAULT_SEARCH_LIMIT } from "metabase/lib/constants";
import Search from "metabase/entities/search";
import SearchResult from "metabase/search/components/SearchResult";
import EmptyState from "metabase/components/EmptyState";
import { EmptyStateContainer } from "./SearchResults.styled";

const propTypes = {
  searchText: PropTypes.string,
};

export const SearchResults = ({ searchText }) => {
  return (
    <Search.ListLoader
      query={{ q: searchText, limit: DEFAULT_SEARCH_LIMIT }}
      wrapped
      reload
      debounced
    >
      {({ list }) => {
        const hasResults = list.length > 0;

        return (
          <ul data-testid="search-results-list">
            {hasResults ? (
              list.map(item => (
                <li key={`${item.model}:${item.id}`}>
                  <SearchResult result={item} compact={true} />
                </li>
              ))
            ) : (
              <EmptyStateContainer>
                <EmptyState message={t`Didn't find anything`} icon="search" />
              </EmptyStateContainer>
            )}
          </ul>
        );
      }}
    </Search.ListLoader>
  );
};

SearchResults.propTypes = propTypes;
