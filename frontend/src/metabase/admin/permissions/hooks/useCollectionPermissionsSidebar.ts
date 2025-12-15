import { useMemo } from "react";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import {
  ROOT_COLLECTION,
  getCollectionIcon,
} from "metabase/entities/collections";
import type { Collection, CollectionId } from "metabase-types/api";
import type { CollectionTreeItem } from "metabase-types/store";

import type { CollectionPermissionsConfig } from "../pages/CollectionPermissionsPage/types";

function buildCollectionTree(collections: Collection[]): CollectionTreeItem[] {
  return collections.map((collection) => {
    const icon = getCollectionIcon(collection);
    return {
      id: collection.id,
      name: collection.name,
      icon: icon.name,
      children: collection.children
        ? buildCollectionTree(collection.children)
        : [],
    };
  });
}

export function useCollectionPermissionsSidebar(
  config: CollectionPermissionsConfig,
  selectedCollectionId: CollectionId | undefined,
) {
  const { data: collections, isLoading } = useListCollectionsTreeQuery(
    config.collectionsQuery,
  );

  const sidebar = useMemo(() => {
    const rootCollectionIcon = getCollectionIcon(ROOT_COLLECTION);
    const rootItem: CollectionTreeItem = {
      id: ROOT_COLLECTION.id,
      name: config.rootCollectionName ?? ROOT_COLLECTION.name,
      icon: rootCollectionIcon.name,
      children: [],
    };

    const tree = [rootItem, ...buildCollectionTree(collections ?? [])];

    return {
      selectedId: selectedCollectionId,
      title: config.sidebarTitle,
      entityGroups: [tree],
      filterPlaceholder: t`Search for a collection`,
    };
  }, [collections, selectedCollectionId, config]);

  return { sidebar, isLoading };
}
