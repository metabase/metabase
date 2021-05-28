import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Card from "metabase/components/Card";
import SearchResult from "metabase/search/components/SearchResult";
import Search from "metabase/entities/search";

function SearchResults({ searchText }) {
  return (
    <Card className="overflow-y-auto" style={{ maxHeight: 400 }} py={1}>
      <Search.ListLoader
        query={{ q: searchText.trim() }}
        wrapped
        reload
        debounced
      >
        {({ list }) => {
          return (
            <ol>
              {list.length === 0 ? (
                <li className="flex flex-column align-center justify-center p4 text-medium text-centered">
                  <div className="my3">
                    <Icon name="search" mb={1} size={24} />
                    <h3 className="text-light">{t`Didn't find anything`}</h3>
                  </div>
                </li>
              ) : (
                list.map(l => (
                  <li key={`${l.model}:${l.id}`}>
                    <SearchResult result={l} compact={true} />
                  </li>
                ))
              )}
            </ol>
          );
        }}
      </Search.ListLoader>
    </Card>
  );
}

SearchResults.propTypes = {
  searchText: PropTypes.string,
};

export default SearchResults;
