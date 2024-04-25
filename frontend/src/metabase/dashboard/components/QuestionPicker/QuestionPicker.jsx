import PropTypes from "prop-types";
import { useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { isPublicCollection } from "metabase/collections/utils";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import SelectList from "metabase/components/SelectList";
import { getDashboard } from "metabase/dashboard/selectors";
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import { entityListLoader } from "metabase/entities/containers/EntityListLoader";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { getCrumbs } from "metabase/lib/collections";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Icon } from "metabase/ui";

import { QuestionList } from "./QuestionList";
import {
  BreadcrumbsWrapper,
  QuestionPickerRoot,
  SearchInput,
} from "./QuestionPicker.styled";

QuestionPickerInner.propTypes = {
  onSelect: PropTypes.func.isRequired,
  collectionsById: PropTypes.object,
  getCollectionIcon: PropTypes.func,
};

function QuestionPickerInner({ onSelect, collectionsById, getCollectionIcon }) {
  const dashboard = useSelector(getDashboard);
  const dashboardCollection = dashboard.collection ?? ROOT_COLLECTION;
  const [currentCollectionId, setCurrentCollectionId] = useState(
    dashboardCollection.id,
  );
  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
  );

  const collection = collectionsById[currentCollectionId];
  const crumbs = getCrumbs(collection, collectionsById, setCurrentCollectionId);

  const handleSearchTextChange = e => setSearchText(e.target.value);

  const allCollections = (collection && collection.children) || [];
  const showOnlyPublicCollections = isPublicCollection(dashboardCollection);
  const collections = showOnlyPublicCollections
    ? allCollections.filter(isPublicCollection)
    : allCollections;

  return (
    <QuestionPickerRoot>
      <SearchInput
        fullWidth
        autoFocus
        data-autofocus
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
        showOnlyPublicCollections={showOnlyPublicCollections}
      />
    </QuestionPickerRoot>
  );
}

export const QuestionPicker = _.compose(
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
)(QuestionPickerInner);
