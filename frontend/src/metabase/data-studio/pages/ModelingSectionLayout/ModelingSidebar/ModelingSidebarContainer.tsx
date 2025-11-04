import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import {
  currentUserPersonalCollections,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import type { CollectionTreeItem } from "metabase/entities/collections";
import {
  ROOT_COLLECTION,
  buildCollectionTree,
  getCollectionIcon,
} from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import { ModelingSidebarView } from "./ModelingSidebarView";

export function ModelingSidebarContainer() {
  const currentUser = useSelector(getUser);

  const { data: collections = [], isLoading } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
  });

  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
    if (!currentUser) {
      return [];
    }

    const preparedCollections = [];
    const userPersonalCollections = currentUserPersonalCollections(
      collections,
      currentUser.id,
    );
    const displayableCollections = collections.filter((collection) =>
      nonPersonalOrArchivedCollection(collection),
    );

    preparedCollections.push(...userPersonalCollections);
    preparedCollections.push(...displayableCollections);

    const tree = buildCollectionTree(preparedCollections);

    const root: CollectionTreeItem = {
      ...ROOT_COLLECTION,
      icon: getCollectionIcon(ROOT_COLLECTION),
      children: [],
    };

    return [root, ...tree];
  }, [collections, currentUser]);

  if (isLoading || !currentUser) {
    return null;
  }

  return <ModelingSidebarView collections={collectionTree} />;
}
