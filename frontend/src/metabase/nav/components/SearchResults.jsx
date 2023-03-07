import React, { useEffect } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import { DEFAULT_SEARCH_LIMIT } from "metabase/lib/constants";
import Search from "metabase/entities/search";
import SearchResult from "metabase/search/components/SearchResult";
import EmptyState from "metabase/components/EmptyState";
import { useListKeyboardNavigation } from "metabase/hooks/use-list-keyboard-navigation";
import { EmptyStateContainer } from "./SearchResults.styled";

const propTypes = {
  list: PropTypes.array,
  onChangeLocation: PropTypes.func,
  onEntitySelect: PropTypes.func,
  searchText: PropTypes.string,
};

const SearchResults = ({
  list,
  onChangeLocation,
  onEntitySelect,
  searchText,
}) => {
  const { reset, getRef, cursorIndex } = useListKeyboardNavigation({
    list,
    onEnter: onEntitySelect
      ? onEntitySelect
      : item => onChangeLocation(item.getUrl()),
    resetOnListChange: false,
  });

  useEffect(() => {
    reset();
  }, [searchText, reset]);

  const hasResults = list.length > 0;

  return (
    <ul data-testid="search-results-list">
      {hasResults ? (
        list.map((item, index) => (
          <li key={`${item.model}:${item.id}`} ref={getRef(item)}>
            <SearchResult
              result={item}
              compact={true}
              isSelected={cursorIndex === index}
              onClick={onEntitySelect}
            />
          </li>
        ))
      ) : (
        <EmptyStateContainer>
          <EmptyState message={t`Didn't find anything`} icon="search" />
        </EmptyStateContainer>
      )}
    </ul>
  );
};

SearchResults.propTypes = propTypes;

export default _.compose(
  connect(null, {
    onChangeLocation: push,
  }),
  Search.loadList({
    wrapped: true,
    reload: true,
    debounced: true,
    query: (_state, props) => ({
      q: props.searchText,
      limit: DEFAULT_SEARCH_LIMIT,
      models: props.models,
    }),
  }),
)(SearchResults);
