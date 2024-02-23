import PropTypes from "prop-types";
import { useEffect } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import EmptyState from "metabase/components/EmptyState";
import Search from "metabase/entities/search";
import { useListKeyboardNavigation } from "metabase/hooks/use-list-keyboard-navigation";
import { DEFAULT_SEARCH_LIMIT } from "metabase/lib/constants";
import { SearchResult } from "metabase/search/components/SearchResult";

import { EmptyStateContainer } from "./SearchResults.styled";

const propTypes = {
  list: PropTypes.array,
  onChangeLocation: PropTypes.func,
  onEntitySelect: PropTypes.func,
  forceEntitySelect: PropTypes.bool,
  searchText: PropTypes.string,
};

const SearchResults = ({
  list,
  onChangeLocation,
  onEntitySelect,
  forceEntitySelect,
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
        list.map((item, index) => {
          const isIndexedEntity = item.model === "indexed-entity";
          const onClick =
            onEntitySelect && (isIndexedEntity || forceEntitySelect)
              ? onEntitySelect
              : undefined;

          return (
            <li key={`${item.model}:${item.id}`} ref={getRef(item)}>
              <SearchResult
                result={item}
                compact={true}
                isSelected={cursorIndex === index}
                onClick={onClick}
              />
            </li>
          );
        })
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
