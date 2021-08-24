import React from "react";
import PropTypes from "prop-types";
import { Box } from "grid-styled";
import { t } from "ttag";

import Search from "metabase/entities/search";
import SearchResult from "metabase/search/components/SearchResult";
import EmptyState from "metabase/components/EmptyState";

const SEARCH_LIMIT = 50;

const propTypes = {
  searchText: PropTypes.string,
};

export const SearchResults = ({ searchText }) => {
  return (
    <Search.ListLoader
      query={{ q: searchText, limit: SEARCH_LIMIT }}
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
              <Box mt={4} mb={3}>
                <EmptyState message={t`Didn't find anything`} icon="search" />
              </Box>
            )}
          </ul>
        );
      }}
    </Search.ListLoader>
  );
};

SearchResults.propTypes = propTypes;
