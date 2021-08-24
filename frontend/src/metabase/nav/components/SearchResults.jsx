import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Search from "metabase/entities/search";
import Icon from "metabase/components/Icon";
import SearchResult from "metabase/search/components/SearchResult";

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
          <ol data-testid="search-results-list">
            {hasResults ? (
              list.map(item => (
                <li key={`${item.model}:${item.id}`}>
                  <SearchResult result={item} compact={true} />
                </li>
              ))
            ) : (
              <li className="flex flex-column align-center justify-center p4 text-medium text-centered">
                <div className="my3">
                  <Icon name="search" mb={1} size={24} />
                  <h3 className="text-light">{t`Didn't find anything`}</h3>
                </div>
              </li>
            )}
          </ol>
        );
      }}
    </Search.ListLoader>
  );
};

SearchResults.propTypes = propTypes;
