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
import { findCollectionById } from "metabase/common/utils/collections";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { Box, Icon } from "metabase/ui";
import type {
  CardType,
  Collection,
  CollectionContentModel,
  CollectionId,
  DatabaseId,
} from "metabase-types/api";

import { SavedEntityList } from "./SavedEntityList";
import SavedEntityPickerS from "./SavedEntityPicker.module.css";
import { CARD_INFO } from "./constants";

interface SavedEntityPickerProps {
  type: CardType;
  onSelect: (tableOrModelId: string) => void;
  onBack: () => void;
  databaseId?: DatabaseId | null;
  tableId?: string;
  collectionId?: CollectionId;
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
const ALL_PERSONAL_COLLECTIONS_ROOT = {
  ...PERSONAL_COLLECTIONS,
} as Collection;

export function SavedEntityPicker(props: SavedEntityPickerProps) {
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

interface SavedEntityPickerInnerProps extends SavedEntityPickerProps {
  collections: Collection[];
  rootCollection: Collection;
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
}: SavedEntityPickerInnerProps) {
  const currentUser = useSelector(getUser);

  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
    const modelFilter = (model: CollectionContentModel) =>
      CARD_INFO[type].model === model;

    const preparedCollections: Collection[] = [];
    const userPersonalCollections = currentUserPersonalCollections(
      collections,
      currentUser?.id ?? 0,
    );
    const nonPersonalOrArchivedCollections = collections.filter(
      nonPersonalOrArchivedCollection,
    );

    preparedCollections.push(...userPersonalCollections);
    preparedCollections.push(...nonPersonalOrArchivedCollections);

    if (currentUser?.is_superuser) {
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

  const [selectedCollection, setSelectedCollection] = useState<
    Collection | undefined
  >(initialCollection);

  const handleSelect = useCallback(
    (node: ITreeNodeItem) => {
      if (node.id === PERSONAL_COLLECTIONS.id) {
        return;
      }
      // Tree erases node ids to string | number, but these nodes are always
      // collection tree items keyed by CollectionId.
      const collection = findCollectionById(
        collectionTree,
        node.id as CollectionId,
      );
      if (collection) {
        setSelectedCollection(collection);
      }
    },
    [collectionTree],
  );

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
