import {
  isRootCollection,
  isRootPersonalCollection,
  isRootTrashCollection,
  isSyncedCollection,
} from "metabase/collections/utils";
import { color } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import { PLUGIN_COLLECTIONS, PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { IconName, IconProps } from "metabase/ui";
import type { Collection, CollectionContentModel } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { PERSONAL_COLLECTIONS, ROOT_COLLECTION } from "./constants";

export function normalizedCollection(collection: Collection) {
  return isRootCollection(collection) ? ROOT_COLLECTION : collection;
}

export function getCollectionIcon(
  collection: Partial<Collection>,
  { tooltip = "default", isTenantUser = false } = {},
): {
  name: IconName;
  color?: ColorName;
  tooltip?: string;
} {
  if (collection.id === PERSONAL_COLLECTIONS.id) {
    return { name: "group" };
  }

  if (collection.type === "trash") {
    return { name: "trash" };
  }

  if (isRootPersonalCollection(collection)) {
    return { name: "person" };
  }

  if (isSyncedCollection(collection) && !isTenantUser) {
    // tenant users see the normal icon, they don't know what a synced collection is
    return { name: "synced_collection" };
  }

  switch (PLUGIN_DATA_STUDIO.getLibraryCollectionType(collection.type)) {
    case "root":
      return { name: "repository" };
    case "data":
      return { name: "table" };
    case "metrics":
      return { name: "metric" };
  }

  const type = PLUGIN_COLLECTIONS.getCollectionType(collection);
  return type
    ? {
        name: type.icon as unknown as IconName,
        color: type.color ? color(type.color) : undefined,
        tooltip: type.tooltips?.[tooltip],
      }
    : { name: "folder" };
}

export function getCollectionType(
  collectionId: Collection["id"] | undefined | null,
  state: State,
) {
  if (collectionId === null || collectionId === "root") {
    return "root";
  }
  if (collectionId === getUserPersonalCollectionId(state)) {
    return "personal";
  }
  return collectionId !== undefined ? "other" : null;
}

export interface CollectionTreeItem extends Collection {
  icon: IconName | IconProps;
  children: CollectionTreeItem[];
  schemaName?: string;
}

export function buildCollectionTree(
  collections: Collection[] = [],
  {
    modelFilter,
    isTenantUser = false,
  }: {
    modelFilter?: (model: CollectionContentModel) => boolean;
    isTenantUser?: boolean;
  } = {},
): CollectionTreeItem[] {
  return collections.flatMap((collection) => {
    const isPersonalRoot = collection.id === PERSONAL_COLLECTIONS.id;

    const isMatchedByFilter =
      !modelFilter ||
      collection.here?.some(modelFilter) ||
      collection.below?.some(modelFilter);

    if (!isPersonalRoot && !isMatchedByFilter) {
      return [];
    }

    const children = !isRootTrashCollection(collection)
      ? buildCollectionTree(
          collection.children?.filter((child) => !child.archived) || [],
          { modelFilter, isTenantUser },
        )
      : [];

    if (isPersonalRoot && children.length === 0) {
      return [];
    }

    return {
      ...collection,
      schemaName: collection.originalName || collection.name,
      icon: getCollectionIcon(collection, { isTenantUser }),
      children,
    };
  });
}
