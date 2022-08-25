import _ from "underscore";

import { color } from "metabase/lib/colors";

import { getUserPersonalCollectionId } from "metabase/selectors/user";
import {
  isPersonalCollection,
  canonicalCollectionId,
} from "metabase/collections/utils";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";

import { ROOT_COLLECTION, PERSONAL_COLLECTIONS } from "./constants";

export function getCollectionIcon(collection, { tooltip = "default" } = {}) {
  if (collection.id === PERSONAL_COLLECTIONS.id) {
    return { name: "group" };
  }
  if (isPersonalCollection(collection)) {
    return { name: "person" };
  }
  const authorityLevel =
    PLUGIN_COLLECTIONS.AUTHORITY_LEVEL[collection.authority_level];

  return authorityLevel
    ? {
        name: authorityLevel.icon,
        color: color(authorityLevel.color),
        tooltip: authorityLevel.tooltips?.[tooltip],
      }
    : { name: "folder" };
}

export function normalizedCollection(collection) {
  if (canonicalCollectionId(collection.id) === null) {
    return ROOT_COLLECTION;
  }
  return collection;
}

export const getCollectionType = (collectionId, state) =>
  collectionId === null || collectionId === "root"
    ? "root"
    : collectionId === getUserPersonalCollectionId(state)
    ? "personal"
    : collectionId !== undefined
    ? "other"
    : null;

function hasIntersection(list1, list2) {
  if (!list2) {
    return false;
  }
  return _.intersection(list1, list2).length > 0;
}

export function buildCollectionTree(collections, { targetModels } = {}) {
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
