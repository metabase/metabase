import React, { useState } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { connect } from "react-redux";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { entityListLoader } from "metabase/entities/containers/EntityListLoader";
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";

import { QuestionPickerItem } from "./QuestionPickerItem";
import { QuestionList } from "./QuestionList";

import { BreadcrumbsWrapper, SearchInput } from "./QuestionPicker.styled";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";

QuestionPicker.propTypes = {
  onSelect: PropTypes.func.isRequired,
  collectionsById: PropTypes.object,
  getCollectionIcon: PropTypes.func,
  initialCollection: PropTypes.number,
};

function QuestionPicker({
  onSelect,
  collectionsById,
  getCollectionIcon,
  initialCollection,
}) {
  const [currentCollectionId, setCurrentCollectionId] = useState(
    initialCollection || ROOT_COLLECTION.id,
  );
  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
  );

  const collection = collectionsById[currentCollectionId];

  const getCrumbs = collection => {
    if (collection && collection.path) {
      return [
        ...collection.path.map(id => [
          collectionsById[id].name,
          () => setCurrentCollectionId(id),
        ]),
        [collection.name],
      ];
    }

    return [];
  };
  const crumbs = getCrumbs(collection);

  const handleSearchTextChange = value => setSearchText(value);

  const collections = (collection && collection.children) || [];

  return (
    <div>
      <SearchInput
        hasClearButton
        placeholder={t`Search…`}
        value={searchText}
        onChange={handleSearchTextChange}
        icon={<Icon name="search" size={16} />}
      />

      {!debouncedSearchText && (
        <React.Fragment>
          <BreadcrumbsWrapper>
            <Breadcrumbs crumbs={crumbs} />
          </BreadcrumbsWrapper>

          <ul>
            {collections.map(collection => (
              <QuestionPickerItem
                isCollection
                key={collection.id}
                id={collection.id}
                name={collection.name}
                icon={getCollectionIcon(collection)}
                onSelect={collectionId => setCurrentCollectionId(collectionId)}
              />
            ))}
          </ul>
        </React.Fragment>
      )}

      <QuestionList
        hasCollections={collections.length > 0}
        searchText={debouncedSearchText}
        collectionId={currentCollectionId}
        onSelect={onSelect}
      />
    </div>
  );
}

export default _.compose(
  entityListLoader({
    entityType: "collections",
    loadingAndErrorWrapper: false,
  }),
  connect((state, props) => ({
    collectionsById: (
      props.entity || Collections
    ).selectors.getExpandedCollectionsById(state),
    getCollectionIcon: (props.entity || Collections).objectSelectors.getIcon,
  })),
)(QuestionPicker);
