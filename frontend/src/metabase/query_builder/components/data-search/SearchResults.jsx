import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import Search from "metabase/entities/search";

import { SearchResultItem } from "./SearchResultItem";

export function SearchResults({ searchQuery, onSelect, selectedDatabase }) {
  return (
    <div>
      <Search.ListLoader
        query={{
          q: searchQuery,
          models: ["card", "table"], // TODO: support on the back end
          database: selectedDatabase != null ? selectedDatabase.id : null, // TODO: support on the back end
        }}
        wrapped
        reload
        debounced
      >
        {({ list }) => {
          if (list.length === 0) {
            return (
              <li className="flex flex-column align-center justify-center p4 text-medium text-centered">
                <div className="my3">
                  <Icon name="search" mb={1} size={24} />
                  <h3 className="text-light">{t`No results found`}</h3>
                </div>
              </li>
            );
          }

          return (
            <ol>
              {list.map(item => (
                <SearchResultItem item={item} onSelect={onSelect} />
              ))}
            </ol>
          );
        }}
      </Search.ListLoader>
    </div>
  );
}

SearchResults.propTypes = {
  selectedDatabase: PropTypes.object,
  searchQuery: PropTypes.string.required,
  onSelect: PropTypes.func.required,
};
