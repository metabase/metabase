import PropTypes from "prop-types";
import { useCallback, useMemo, useState } from "react";

import {
  useGetCollectionQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { PERSONAL_COLLECTIONS } from "metabase/common/collections/constants";
import {
  buildCollectionTree,
  currentUserPersonalCollections,
  isRootPersonalCollection,
  nonPersonalOrArchivedCollection,
} from "metabase/common/collections/utils";
import { Tree } from "metabase/common/components/tree";
import { findCollectionById } from "metabase/common/utils/collections";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { Box, Icon } from "metabase/ui";

import { SavedEntityList } from "./SavedEntityList";
import SavedEntityPickerS from "./SavedEntityPicker.module.css";
import { CARD_INFO } from "./constants";

const propTypes = {
  type: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  databaseId: PropTypes.string,
  tableId: PropTypes.string,
  collectionId: PropTypes.number,
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

export function SavedEntityPicker(props) {
  const { data: collections } = useListCollectionsTreeQuery({
    "exclude-archived": true,
  });
  const { data: rootCollection } = useGetCollectionQuery({ id: "root" });
  if (!collections || !rootCollection) {
    return null;
  }
  return (
    <SavedEntityPickerInner
      {...props}
      collections={collections}
      rootCollection={rootCollection}
    />
  );
}

function SavedEntityPickerInner({
  type,
  onBack,
  onSelect,
  databaseId,
  tableId,
  collectionId,
  collections,
  rootCollection,
}) {
  const currentUser = useSelector(getUser);

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

SavedEntityPicker.propTypes = propTypes;
SavedEntityPickerInner.propTypes = {
  ...propTypes,
  collections: PropTypes.array.isRequired,
  rootCollection: PropTypes.object.isRequired,
};
