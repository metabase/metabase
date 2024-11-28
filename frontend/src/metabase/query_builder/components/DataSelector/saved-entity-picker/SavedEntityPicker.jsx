import PropTypes from "prop-types";
import { useCallback, useMemo, useState } from "react";
import { connect } from "react-redux";
import _ from "underscore";

import {
  currentUserPersonalCollections,
  isRootPersonalCollection,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import { Tree } from "metabase/components/tree";
import CS from "metabase/css/core/index.css";
import Collection, {
  PERSONAL_COLLECTIONS,
  buildCollectionTree,
} from "metabase/entities/collections";
import { Icon } from "metabase/ui";

import SavedEntityList from "./SavedEntityList";
import {
  BackButton,
  CollectionsContainer,
  SavedEntityPickerRoot,
  TreeContainer,
} from "./SavedEntityPicker.styled";
import { CARD_INFO } from "./constants";
import { findCollectionById } from "./utils";

const propTypes = {
  type: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  collections: PropTypes.array.isRequired,
  currentUser: PropTypes.object.isRequired,
  databaseId: PropTypes.string,
  tableId: PropTypes.string,
  collectionId: PropTypes.number,
  rootCollection: PropTypes.object,
};

const getOurAnalyticsCollection = collectionEntity => {
  return {
    ...collectionEntity,
    schemaName: "Everything else",
    icon: "folder",
  };
};

const ALL_PERSONAL_COLLECTIONS_ROOT = {
  ...PERSONAL_COLLECTIONS,
};

function SavedEntityPicker({
  type,
  onBack,
  onSelect,
  collections,
  currentUser,
  databaseId,
  tableId,
  collectionId,
  rootCollection,
}) {
  const collectionTree = useMemo(() => {
    const modelFilter = model => CARD_INFO[type].model === model;

    const preparedCollections = [];
    const userPersonalCollections = currentUserPersonalCollections(
      collections,
      currentUser.id,
    );
    const nonPersonalOrArchivedCollections = collections.filter(
      nonPersonalOrArchivedCollection,
    );

    preparedCollections.push(...userPersonalCollections);
    preparedCollections.push(...nonPersonalOrArchivedCollections);

    if (currentUser.is_superuser) {
      const otherPersonalCollections = collections.filter(
        collection =>
          isRootPersonalCollection(collection) &&
          collection.personal_owner_id !== currentUser.id,
      );

      if (otherPersonalCollections.length > 0) {
        preparedCollections.push({
          ...ALL_PERSONAL_COLLECTIONS_ROOT,
          children: otherPersonalCollections,
        });
      }
    }

    return [
      ...(rootCollection ? [getOurAnalyticsCollection(rootCollection)] : []),
      ...buildCollectionTree(preparedCollections, modelFilter),
    ];
  }, [collections, rootCollection, currentUser, type]);

  const initialCollection = useMemo(
    () => findCollectionById(collectionTree, collectionId) ?? collectionTree[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [selectedCollection, setSelectedCollection] =
    useState(initialCollection);

  const handleSelect = useCallback(collection => {
    if (collection.id === PERSONAL_COLLECTIONS.id) {
      return;
    }
    setSelectedCollection(collection);
  }, []);

  return (
    <SavedEntityPickerRoot>
      <CollectionsContainer>
        <BackButton onClick={onBack} data-testid="saved-entity-back-navigation">
          <Icon name="chevronleft" className={CS.mr1} />
          {CARD_INFO[type].title}
        </BackButton>
        <TreeContainer data-testid="saved-entity-collection-tree">
          <Tree
            data={collectionTree}
            onSelect={handleSelect}
            selectedId={selectedCollection?.id}
          />
        </TreeContainer>
      </CollectionsContainer>
      <SavedEntityList
        type={type}
        collection={selectedCollection}
        selectedId={tableId}
        databaseId={databaseId}
        onSelect={onSelect}
      />
    </SavedEntityPickerRoot>
  );
}

SavedEntityPicker.propTypes = propTypes;

const mapStateToProps = ({ currentUser }) => ({ currentUser });

export default _.compose(
  Collection.load({
    id: () => "root",
    entityAlias: "rootCollection",
    loadingAndErrorWrapper: false,
  }),
  Collection.loadList({
    query: () => ({ tree: true, "exclude-archived": true }),
  }),
  connect(mapStateToProps),
)(SavedEntityPicker);
