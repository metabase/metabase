import _ from "underscore";

import { IconProps } from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

import { getUserPersonalCollectionId } from "metabase/selectors/user";
import {
  isRootCollection,
  isPersonalCollection,
} from "metabase/collections/utils";
import {
  getDataAppIcon,
  isDataAppCollection,
} from "metabase/entities/data-apps/utils";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";

import type { Collection, CollectionContentModel } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { ROOT_COLLECTION, PERSONAL_COLLECTIONS } from "./constants";

export function normalizedCollection(collection: Collection) {
  return isRootCollection(collection) ? ROOT_COLLECTION : collection;
}

export function getCollectionIcon(
  collection: Collection,
  { tooltip = "default" } = {},
) {
  if (isDataAppCollection(collection)) {
    return getDataAppIcon();
  }
  if (collection.id === PERSONAL_COLLECTIONS.id) {
    return { name: "group" };
  }
  if (isPersonalCollection(collection)) {
    return { name: "person" };
  }
  const authorityLevel =
    PLUGIN_COLLECTIONS.AUTHORITY_LEVEL[collection.authority_level as string];

  return authorityLevel
    ? {
        name: authorityLevel.icon,
        color: authorityLevel.color ? color(authorityLevel.color) : undefined,
        tooltip: authorityLevel.tooltips?.[tooltip],
      }
    : { name: "folder" };
}

export function getCollectionType(
  collectionId: Collection["id"] | undefined,
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

function hasIntersection(list1: unknown[], list2?: unknown[]) {
  if (!list2) {
    return false;
  }
  return _.intersection(list1, list2).length > 0;
}

export interface CollectionTreeItem extends Collection {
  icon: string | IconProps;
  children: CollectionTreeItem[];
}

export function buildCollectionTree(
  collections: Collection[],
  { targetModels }: { targetModels?: CollectionContentModel[] } = {},
): CollectionTreeItem[] {
  if (collections == null) {
    return [];
  }

  const shouldFilterCollections = Array.isArray(targetModels);

  return collections.flatMap(collection => {
    const hasTargetModels =
      !shouldFilterCollections ||
      hasIntersection(targetModels, collection.below) ||
      hasIntersection(targetModels, collection.here);

    return hasTargetModels
      ? {
          ...collection,
          schemaName: collection.originalName || collection.name,
          icon: getCollectionIcon(collection),
          children: buildCollectionTree(
            collection.children?.filter(child => !child.archived) || [],
            {
              targetModels,
            },
          ),
        }
      : [];
  });
}
