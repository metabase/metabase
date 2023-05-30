import React, { useState } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { connect } from "react-redux";
import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import { entityListLoader } from "metabase/entities/containers/EntityListLoader";
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import { getCrumbs } from "metabase/lib/collections";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";

import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import SelectList from "metabase/components/SelectList";
import { QuestionList } from "./QuestionList";

import {
  BreadcrumbsWrapper,
  QuestionPickerRoot,
  SearchInput,
} from "./QuestionPicker.styled";

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
  const crumbs = getCrumbs(collection, collectionsById, setCurrentCollectionId);

  const handleSearchTextChange = e => setSearchText(e.target.value);

  const collections = (collection && collection.children) || [];

  return (
    <QuestionPickerRoot>
      <SearchInput
        fullWidth
        autoFocus
        placeholder={t`Search…`}
        value={searchText}
        icon={<Icon name="search" size={16} />}
        onResetClick={() => setSearchText("")}
        onChange={handleSearchTextChange}
      />

      {!debouncedSearchText && (
        <>
          <BreadcrumbsWrapper>
            <Breadcrumbs crumbs={crumbs} />
          </BreadcrumbsWrapper>

          {collections.length > 0 && (
            <SelectList>
              {collections.map(collection => {
                const icon = getCollectionIcon(collection);
                const iconColor = PLUGIN_COLLECTIONS.isRegularCollection(
                  collection,
                )
                  ? "text-light"
                  : icon.color;
                return (
                  <SelectList.Item
                    key={collection.id}
                    id={collection.id}
                    name={collection.name}
                    icon={{
                      ...icon,
                      color: iconColor,
                    }}
                    rightIcon="chevronright"
                    onSelect={collectionId =>
                      setCurrentCollectionId(collectionId)
                    }
                  />
                );
              })}
            </SelectList>
          )}
        </>
      )}

      <QuestionList
        hasCollections={collections.length > 0}
        searchText={debouncedSearchText}
        collectionId={currentCollectionId}
        onSelect={onSelect}
      />
    </QuestionPickerRoot>
  );
}

export default _.compose(
  entityObjectLoader({
    id: () => "root",
    entityType: "collections",
    loadingAndErrorWrapper: false,
  }),
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
