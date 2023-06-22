import styled from "@emotion/styled";
import PropTypes from "prop-types";
import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import SearchResult from "metabase/search/components/SearchResult";
import { DEFAULT_SEARCH_LIMIT } from "metabase/lib/constants";
import Search from "metabase/entities/search";

const propTypes = {
  databaseId: PropTypes.string,
  searchQuery: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  searchModels: PropTypes.arrayOf(
    PropTypes.oneOf(["card", "dataset", "table"]),
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
    limit: DEFAULT_SEARCH_LIMIT,
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
                  <Icon name="search" className="mb1" size={32} />
                  <h3 className="text-light">{t`No results found`}</h3>
                </div>
              </div>
            );
          }

          return (
            <ul>
              {list.map(item => (
                <li key={`${item.id}_${item.model}`}>
                  <SearchResult
                    result={item}
                    onClick={onSelect}
                    compact
                    hasDescription={false}
                  />
                </li>
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
