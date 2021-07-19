import React from "react";
import styled from "styled-components";
import PropTypes from "prop-types";
import { t } from "ttag";

import Icon from "metabase/components/Icon";

import Search from "metabase/entities/search";

import { SearchResultItem } from "./SearchResultItem";

const propTypes = {
  databaseId: PropTypes.string,
  searchQuery: PropTypes.string.required,
  onSelect: PropTypes.func.required,
  searchModels: PropTypes.arrayOf(
    PropTypes.arrayOf(PropTypes.oneOf(["card", "table"])),
  ),
};

export function SearchResults({
  searchQuery,
  onSelect,
  databaseId,
  searchModels,
}) {
  const query = {
    q: searchQuery,
    models: searchModels,
  };

  if (databaseId) {
    query["table_db_id"] = databaseId;
  }

  return (
    <SearchResultsRoot>
      <Search.ListLoader query={query} wrapped reload debounced>
        {({ list }) => {
          if (list.length === 0) {
            return (
              <div className="flex flex-column align-center justify-center p4 text-medium text-centered">
                <div className="my4">
                  <Icon name="search" mb={1} size={32} />
                  <h3 className="text-light">{t`No results found`}</h3>
                </div>
              </div>
            );
          }

          return (
            <ul>
              {list.map(item => (
                <SearchResultItem
                  key={`${item.id}_${item.model}`}
                  item={item}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          );
        }}
      </Search.ListLoader>
    </SearchResultsRoot>
  );
}

SearchResults.propTypes = propTypes;

const SearchResultsRoot = styled.div`
  width: 300px;
  overflow-y: auto;
`;
