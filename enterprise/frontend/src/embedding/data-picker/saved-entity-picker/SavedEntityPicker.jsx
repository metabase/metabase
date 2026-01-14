import PropTypes from "prop-types";
import { useCallback, useMemo, useState } from "react";
import _ from "underscore";

import {
  currentUserPersonalCollections,
  isRootPersonalCollection,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import { Tree } from "metabase/common/components/tree";
import CS from "metabase/css/core/index.css";
import {
  Collections,
  PERSONAL_COLLECTIONS,
  buildCollectionTree,
} from "metabase/entities/collections";
import { connect } from "metabase/lib/redux";
import { Box, Icon } from "metabase/ui";

import SavedEntityList from "./SavedEntityList";
import SavedEntityPickerS from "./SavedEntityPicker.module.css";
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

const getOurAnalyticsCollection = (collectionEntity) => {
  return {
    ...collectionEntity,
    schemaName: "Everything else",
    icon: "folder",
  };
};

const ALL_PERSONAL_COLLECTIONS_ROOT = {
  ...PERSONAL_COLLECTIONS,
};

/**
 * @typedef {import("metabase/embedding-sdk/types/components/data-picker").DataSourceSelectorProps} DataSourceSelectorProps
 *
 * @typedef {object} SavedEntityPickerOwnProps
 * @property {DataSourceSelectorProps['selectedCollectionId']} collectionId
 * @property {Extract<import("metabase-types/api").CardType, 'model' | 'question'>} type
 * @property {string} tableId
 * @property {DataSourceSelectorProps['selectedDatabaseId']} databaseId
 * @property {(cardId: string) => void} onSelect
 * @property {() => void} onBack
 *
 * @typedef {object} SavedEntityPickerComposedProps
 * @property {import("metabase-types/api").User} currentUser
 * @property {import("metabase-types/api").Collection[]} collections
 * @property {import("metabase-types/api").Collection} rootCollection
 */

/**
 *
 * @param {SavedEntityPickerOwnProps & SavedEntityPickerComposedProps} props
 * @returns {JSX.Element}
 */
function InnerSavedEntityPicker({
  collectionId,
  type,
  tableId,
  databaseId,
  onSelect,
  onBack,

  currentUser,
  collections,
  rootCollection,
}) {
  const collectionTree = useMemo(() => {
    const modelFilter = (model) => CARD_INFO[type].model === model;

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
        (collection) =>
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
      ...buildCollectionTree(preparedCollections, { modelFilter }),
    ];
  }, [collections, rootCollection, currentUser, type]);

  const initialCollection = useMemo(
    () => findCollectionById(collectionTree, collectionId) ?? collectionTree[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [selectedCollection, setSelectedCollection] =
    useState(initialCollection);

  const handleSelect = useCallback((collection) => {
    if (collection.id === PERSONAL_COLLECTIONS.id) {
      return;
    }
    setSelectedCollection(collection);
  }, []);

  return (
    <Box className={SavedEntityPickerS.SavedEntityPickerRoot}>
      <Box className={SavedEntityPickerS.CollectionsContainer}>
        <a
          className={SavedEntityPickerS.BackButton}
          onClick={onBack}
          data-testid="saved-entity-back-navigation"
        >
          <Icon name="chevronleft" className={CS.mr1} />
          {CARD_INFO[type].title}
        </a>
        <Box m="0.5rem 0" data-testid="saved-entity-collection-tree">
          <Tree
            data={collectionTree}
            onSelect={handleSelect}
            selectedId={selectedCollection?.id}
          />
        </Box>
      </Box>
      <SavedEntityList
        type={type}
        collection={selectedCollection}
        selectedId={tableId}
        databaseId={databaseId}
        onSelect={onSelect}
      />
    </Box>
  );
}

InnerSavedEntityPicker.propTypes = propTypes;

const mapStateToProps = ({ currentUser }) => ({ currentUser });

/** @type {React.FC<SavedEntityPickerOwnProps>} */
export const SavedEntityPicker = _.compose(
  Collections.load({
    id: () => "root",
    entityAlias: "rootCollection",
    loadingAndErrorWrapper: false,
  }),
  Collections.loadList({
    query: () => ({
      tree: true,
      "exclude-archived": true,
      namespaces: ["", "shared-tenant-collection", "tenant-specific"],
    }),
  }),
  connect(mapStateToProps),
)(InnerSavedEntityPicker);
