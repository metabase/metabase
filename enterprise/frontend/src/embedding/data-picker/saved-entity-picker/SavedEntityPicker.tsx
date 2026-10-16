import { useCallback, useMemo, useState } from "react";

import {
  useGetCollectionQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { PERSONAL_COLLECTIONS } from "metabase/common/collections/constants";
import type { CollectionTreeItem } from "metabase/common/collections/utils";
import {
  buildCollectionTree,
  currentUserPersonalCollections,
  isRootPersonalCollection,
  nonPersonalOrArchivedCollection,
} from "metabase/common/collections/utils";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import CS from "metabase/css/core/index.css";
import { getUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { Box, Icon } from "metabase/ui";
import { mergeLazily } from "metabase/utils/merge-lazily";
import type {
  Collection,
  CollectionId,
  DatabaseId,
  TableId,
  User,
} from "metabase-types/api";

import type { SavedEntityType } from "../types";

import { SavedEntityList } from "./SavedEntityList";
import SavedEntityPickerS from "./SavedEntityPicker.module.css";
import { CARD_INFO, COLLECTION_TREE_REQUEST } from "./constants";
import { findCollectionById } from "./utils";

interface SavedEntityPickerProps {
  type: SavedEntityType;
  /** Limits the tree to this collection and its subcollections, like a Library folder. */
  scopeCollection?: Collection;
  collectionId?: CollectionId | null;
  tableId?: TableId;
  databaseId?: DatabaseId | null;
  onSelect: (tableId: TableId) => void;
  onBack: () => void;
}

const getOurAnalyticsCollection = (
  collectionEntity: Collection,
): CollectionTreeItem => ({
  ...collectionEntity,
  // "Our analytics" is shown here as a flat clickable target; its real children
  // are already listed by buildCollectionTree below, so we explicitly empty
  // them to avoid duplicating the tree.
  children: [],
  schemaName: "Everything else",
  icon: "folder",
});

// A sentinel root node that buildCollectionTree special-cases by id; it isn't a
// real Collection, so we assert the type here rather than fabricate every field.
const ALL_PERSONAL_COLLECTIONS_ROOT = mergeLazily(
  PERSONAL_COLLECTIONS,
) as Collection;

export function SavedEntityPicker(props: SavedEntityPickerProps) {
  const { data: collections } = useListCollectionsTreeQuery(
    COLLECTION_TREE_REQUEST,
  );
  const { data: rootCollection } = useGetCollectionQuery({ id: "root" });
  const currentUser = useSelector(getUser);

  if (!collections || !currentUser) {
    return null;
  }

  return (
    <InnerSavedEntityPicker
      {...props}
      collections={collections}
      rootCollection={rootCollection}
      currentUser={currentUser}
    />
  );
}

interface InnerSavedEntityPickerProps extends SavedEntityPickerProps {
  collections: Collection[];
  rootCollection?: Collection;
  currentUser: User;
}

function InnerSavedEntityPicker({
  collectionId,
  type,
  tableId,
  databaseId,
  onSelect,
  onBack,
  scopeCollection,
  collections,
  rootCollection,
  currentUser,
}: InnerSavedEntityPickerProps) {
  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
    const modelFilter = (model: string) => CARD_INFO[type].model === model;

    if (scopeCollection) {
      return buildCollectionTree([scopeCollection], { modelFilter });
    }

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
      ...resolveLibraryNodes(
        buildCollectionTree(preparedCollections, { modelFilter }),
      ),
    ];
  }, [collections, rootCollection, currentUser, type, scopeCollection]);

  const [selectedCollectionId, setSelectedCollectionId] = useState<
    CollectionId | undefined
  >(() => {
    if (collectionId != null) {
      const collection = findCollectionById(collectionTree, collectionId);
      if (collection) {
        return collection.id;
      }
    }
    return collectionTree[0]?.id;
  });

  const handleSelect = useCallback((collection: ITreeNodeItem) => {
    if (collection.id === PERSONAL_COLLECTIONS.id) {
      return;
    }
    // Tree erases node ids to string | number, but a selected collection
    // node's id is always a CollectionId.
    setSelectedCollectionId(collection.id);
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
          {scopeCollection?.name ?? CARD_INFO[type].title}
        </a>
        <Box m="0.5rem 0" data-testid="saved-entity-collection-tree">
          <Tree
            data={collectionTree}
            onSelect={handleSelect}
            selectedId={selectedCollectionId}
          />
        </Box>
      </Box>
      <SavedEntityList
        type={type}
        collectionId={selectedCollectionId}
        selectedId={tableId}
        databaseId={databaseId}
        onSelect={onSelect}
      />
    </Box>
  );
}

// The Library only holds its Data, Metrics and Dashboards folders, so when a
// single folder is left after filtering, the Library node stands for it:
// selecting the Library lists that folder's items instead of nothing. Same rule
// as `useGetResolvedLibraryCollection` in the core pickers.
function resolveLibraryNodes(
  collectionTree: CollectionTreeItem[],
): CollectionTreeItem[] {
  return collectionTree.map((collection) =>
    collection.type === "library" && collection.children.length === 1
      ? {
          ...collection.children[0],
          name: collection.name,
          schemaName: collection.schemaName,
          icon: collection.icon,
        }
      : collection,
  );
}
