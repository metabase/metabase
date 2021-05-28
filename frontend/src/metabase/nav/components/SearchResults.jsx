import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import SearchResult from "metabase/search/components/SearchResult";
import Search from "metabase/entities/search";

import {
  SearchTypeaheadCard,
  SearchResultList,
  NoSearchResults,
} from "./SearchResults.styled";

function SearchResults({ searchText }) {
  return (
    <SearchTypeaheadCard>
      <Search.ListLoader
        query={{ q: searchText.trim() }}
        wrapped
        reload
        debounced
      >
        {({ list: results }) => (
          <SearchResultList>
            {results.length === 0 ? (
              <NoSearchResults>
                <Icon name="search" mb={1} size={24} />
                <h3 className="text-light">{t`Didn't find anything`}</h3>
              </NoSearchResults>
            ) : (
              results.map(result => (
                <li key={`${result.model}:${result.id}`}>
                  <SearchResult result={result} compact={true} />
                </li>
              ))
            )}
          </SearchResultList>
        )}
      </Search.ListLoader>
    </SearchTypeaheadCard>
  );
}

SearchResults.propTypes = {
  searchText: PropTypes.string,
};

export default SearchResults;
