import { useCallback, useMemo, useState } from "react";

import {
  useGetCollectionQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { PERSONAL_COLLECTIONS } from "metabase/collections/constants";
import type { CollectionTreeItem } from "metabase/collections/utils";
import {
  buildCollectionTree,
  currentUserPersonalCollections,
  isRootPersonalCollection,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { Box, Icon } from "metabase/ui";
import type {
  CardType,
  Collection,
  CollectionId,
  DatabaseId,
} from "metabase-types/api";

import SavedEntityList from "./SavedEntityList";
import SavedEntityPickerS from "./SavedEntityPicker.module.css";
import { CARD_INFO } from "./constants";
import { findCollectionById } from "./utils";

type SavedEntityType = Extract<CardType, "model" | "question">;

interface SavedEntityPickerProps {
  type: SavedEntityType;
  collectionId?: CollectionId;
  tableId?: string;
  databaseId?: DatabaseId;
  onSelect: (cardId: string) => void;
  onBack: () => void;
}

const getOurAnalyticsCollection = (
  collectionEntity: Collection,
): CollectionTreeItem => ({
  ...collectionEntity,
  children: [],
  schemaName: "Everything else",
  icon: "folder",
});

// A sentinel root node that buildCollectionTree special-cases by id; it isn't a
// real Collection, so we assert the type here rather than fabricate every field.
const ALL_PERSONAL_COLLECTIONS_ROOT = {
  ...PERSONAL_COLLECTIONS,
} as Collection;

export function SavedEntityPicker(props: SavedEntityPickerProps) {
  const { data: collections } = useListCollectionsTreeQuery({
    "exclude-archived": true,
    namespaces: ["", "shared-tenant-collection", "tenant-specific"],
  });
  const { data: rootCollection } = useGetCollectionQuery({ id: "root" });
  if (!collections) {
    return null;
  }
  return (
    <InnerSavedEntityPicker
      {...props}
      collections={collections}
      rootCollection={rootCollection}
    />
  );
}

interface InnerSavedEntityPickerProps extends SavedEntityPickerProps {
  collections: Collection[];
  rootCollection?: Collection;
}

function InnerSavedEntityPicker({
  collectionId,
  type,
  tableId,
  databaseId,
  onSelect,
  onBack,
  collections,
  rootCollection,
}: InnerSavedEntityPickerProps) {
  const currentUser = useSelector(getUser);

  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
    if (!currentUser) {
      return [];
    }

    const modelFilter = (model: string) => CARD_INFO[type].model === model;

    const preparedCollections: Collection[] = [];
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
    () =>
      (collectionId != null
        ? findCollectionById(collectionTree, collectionId)
        : null) ?? collectionTree[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [selectedCollection, setSelectedCollection] =
    useState(initialCollection);

  const handleSelect = useCallback((collection: ITreeNodeItem) => {
    if (collection.id === PERSONAL_COLLECTIONS.id) {
      return;
    }
    // Tree erases the concrete item type to ITreeNodeItem, but at runtime the
    // selected node is one of the CollectionTreeItem entries we passed in.
    setSelectedCollection(collection as CollectionTreeItem);
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
