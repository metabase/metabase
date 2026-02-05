import { getCollectionIcon } from "metabase/entities/collections/utils";
import type { Collection, CollectionId, Transform } from "metabase-types/api";

import {
  type TreeNode,
  getCollectionNodeId,
  getTransformNodeId,
} from "./types";

export function buildTreeData(
  collections: Collection[] | undefined,
  transforms: Transform[] | undefined,
): TreeNode[] {
  if (!collections && !transforms) {
    return [];
  }

  const transformsByCollectionId = new Map<CollectionId | null, Transform[]>();
  for (const transform of transforms ?? []) {
    const collectionId = transform.collection_id;
    if (!transformsByCollectionId.has(collectionId)) {
      transformsByCollectionId.set(collectionId, []);
    }
    transformsByCollectionId.get(collectionId)!.push(transform);
  }

  function buildCollectionNode(collection: Collection): TreeNode {
    const childFolders = (collection.children ?? []).map(buildCollectionNode);
    const childTransforms = (
      transformsByCollectionId.get(collection.id as number) ?? []
    ).map(buildTransformNode);

    return {
      id: getCollectionNodeId(collection.id as number),
      name: collection.name,
      nodeType: "folder",
      icon: getCollectionIcon(collection).name,
      children: [...childFolders, ...childTransforms],
      collectionId: collection.id as number,
    };
  }

  function buildTransformNode(transform: Transform): TreeNode {
    return {
      id: getTransformNodeId(transform.id),
      name: transform.name,
      nodeType: "transform",
      icon: "transform",
      updated_at: transform.updated_at,
      target: transform.target,
      owner: transform.owner,
      owner_email: transform.owner_email,
      transformId: transform.id,
      source_readable: transform.source_readable,
    };
  }

  const rootFolders = (collections ?? []).map(buildCollectionNode);
  const rootTransforms = (transformsByCollectionId.get(null) ?? []).map(
    buildTransformNode,
  );

  return [...rootFolders, ...rootTransforms];
}

export function getDefaultExpandedIds(
  targetCollectionId: number | null,
  targetCollection: Collection | undefined,
): Record<string, boolean> | undefined {
  if (!targetCollectionId || !targetCollection) {
    return undefined;
  }

  const expandedIds: Record<string, boolean> = {};
  const ancestors = targetCollection.effective_ancestors ?? [];

  for (const ancestor of ancestors.slice(1)) {
    expandedIds[getCollectionNodeId(ancestor.id as number)] = true;
  }
  expandedIds[getCollectionNodeId(targetCollectionId)] = true;

  return expandedIds;
}
