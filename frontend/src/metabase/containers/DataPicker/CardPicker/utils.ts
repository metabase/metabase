import {
  isRootPersonalCollection,
  nonPersonalOrArchivedCollection,
  currentUserPersonalCollections,
} from "metabase/collections/utils";
import {
  PERSONAL_COLLECTIONS,
  buildCollectionTree as _buildCollectionTree,
} from "metabase/entities/collections";
import type {
  Collection,
  CollectionContentModel,
  User,
} from "metabase-types/api";

function getOurAnalyticsCollection(collectionEntity: any) {
  return {
    ...collectionEntity,
    schemaName: "Everything else",
    icon: "folder",
  };
}

const ALL_PERSONAL_COLLECTIONS_ROOT = {
  ...PERSONAL_COLLECTIONS,
};

export function buildCollectionTree({
  collections,
  rootCollection,
  currentUser,
  targetModel = "question",
}: {
  collections: Collection[];
  rootCollection: Collection | undefined;
  currentUser: User;
  targetModel?: "model" | "question";
}) {
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
      collection =>
        isRootPersonalCollection(collection) &&
        collection.personal_owner_id !== currentUser.id,
    );

    if (otherPersonalCollections.length > 0) {
      preparedCollections.push({
        ...ALL_PERSONAL_COLLECTIONS_ROOT,
        children: otherPersonalCollections,
      } as Collection);
    }
  }

  const modelFilter =
    targetModel === "model"
      ? (model: CollectionContentModel) => model === "dataset"
      : (model: CollectionContentModel) => model === "card";

  const tree = _buildCollectionTree(preparedCollections, modelFilter);

  if (rootCollection) {
    tree.unshift(getOurAnalyticsCollection(rootCollection));
  }

  return tree;
}
