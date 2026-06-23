import { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";

import { getCollectionIcon } from "metabase/common/collections/utils";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getLibQuery } from "metabase/transforms/utils";
import type { ColorName } from "metabase/ui/colors/types";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  Collection,
  CollectionId,
  RemoteSyncEntity,
  RemoteSyncEntityModel,
  RemoteSyncEntityStatus,
  Transform,
} from "metabase-types/api";

import {
  type TreeNode,
  getCollectionNodeId,
  getTransformNodeId,
  isCollectionNode,
} from "./types";

export function getIncrementalWarning(
  transform: Transform,
  metadata: Metadata,
): string | undefined {
  const isIncremental = transform.target.type === "table-incremental";
  if (!isIncremental) {
    return undefined;
  }

  const isNative = transform.source_type === "native";
  if (isNative) {
    const libQuery = getLibQuery(transform.source, metadata);
    const hasTableTag = libQuery
      ? Object.values(Lib.templateTags(libQuery)).some(
          (tag) => tag.type === "table" && tag["table-id"] != null,
        )
      : false;

    if (!hasTableTag) {
      return t`Incremental transform with a native query requires a table variable. Please add a table variable to the query and update the checkpoint field.`;
    }
  }

  const checkpointFieldId =
    transform.source["source-incremental-strategy"]?.[
      "checkpoint-filter-field-id"
    ];
  if (!checkpointFieldId) {
    return t`Incremental transform is enabled but no checkpoint field is selected. Please select a checkpoint field in the transform settings.`;
  }

  return undefined;
}

function areTransformWarningsEqual(
  a: Map<number, string>,
  b: Map<number, string>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, value] of a) {
    if (b.get(key) !== value) {
      return false;
    }
  }
  return true;
}

export function useGetTransformWarnings(transforms: Transform[] | undefined) {
  const metadata = useSelector(getMetadata);
  const computedWarningsByTransformId = useMemo(() => {
    const warnings = new Map<number, string>();
    for (const transform of transforms ?? []) {
      const warning = getIncrementalWarning(transform, metadata);
      if (warning) {
        warnings.set(transform.id, warning);
      }
    }
    return warnings;
  }, [transforms, metadata]);

  // Reuse the previous Map reference when the content is unchanged so that
  // `columnDefs` (and therefore the TanStack TreeTable's column model) stays
  // stable across `metadata` reference churn. Without this, fetching a single
  // collection (e.g. opening the edit-collection modal) recomputes `metadata`,
  // which propagates a new column reference, remounts row cells, and tears
  // down any modal that lives inside `CollectionRowMenu`.
  const warningsRef = useRef(computedWarningsByTransformId);
  if (
    warningsRef.current !== computedWarningsByTransformId &&
    !areTransformWarningsEqual(
      warningsRef.current,
      computedWarningsByTransformId,
    )
  ) {
    warningsRef.current = computedWarningsByTransformId;
  }
  return warningsRef.current;
}

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
      collection,
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
      can_read: transform.can_read,
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

export function getDescendantCollectionIds(node: TreeNode): Set<number> {
  const ids = new Set<number>();
  const visit = (current: TreeNode) => {
    if (isCollectionNode(current)) {
      ids.add(current.collection.id as number);
    }
    current.children?.forEach(visit);
  };
  visit(node);
  return ids;
}

const TRANSFORM_MODEL = "transform" satisfies RemoteSyncEntityModel;
const COLLECTION_MODEL = "collection" satisfies RemoteSyncEntityModel;
const PYTHON_LIBRARY_MODEL = "pythonlibrary" satisfies RemoteSyncEntityModel;

const SYNC_STATUS_COLOR: Record<RemoteSyncEntityStatus, ColorName> = {
  create: "success",
  update: "warning",
  touch: "warning",
  delete: "danger",
  removed: "danger",
};

export function getSyncColorForEntities(
  entities: RemoteSyncEntity[],
): ColorName | undefined {
  const colors = new Set(
    entities.map((entity) => SYNC_STATUS_COLOR[entity.sync_status]),
  );
  if (colors.size === 0) {
    return undefined;
  }
  if (colors.size === 1) {
    const [color] = colors;
    return color;
  }
  return SYNC_STATUS_COLOR.update;
}

export function getFolderSyncColor(
  subtreeEntities: RemoteSyncEntity[],
  folderCollectionId: number,
): ColorName | undefined {
  if (subtreeEntities.length === 0) {
    return undefined;
  }
  const folderEntity = subtreeEntities.find(
    (entity) =>
      entity.model === COLLECTION_MODEL && entity.id === folderCollectionId,
  );
  const isNewFolder = folderEntity?.sync_status === "create";
  return isNewFolder ? SYNC_STATUS_COLOR.create : SYNC_STATUS_COLOR.update;
}

export function useGetNodeSyncColor(): (
  node: TreeNode,
) => ColorName | undefined {
  const { isVisible: isRemoteSyncVisible } =
    PLUGIN_REMOTE_SYNC.useGitSyncVisible();
  const { dirty } = PLUGIN_REMOTE_SYNC.useRemoteSyncDirtyState();

  const { dirtyTransformById, dirtyPythonLibraries } = useMemo(() => {
    const transformById = new Map<number, RemoteSyncEntity>();
    const pythonLibraries: RemoteSyncEntity[] = [];
    if (isRemoteSyncVisible) {
      for (const entity of dirty) {
        if (entity.model === TRANSFORM_MODEL) {
          transformById.set(entity.id, entity);
        } else if (entity.model === PYTHON_LIBRARY_MODEL) {
          pythonLibraries.push(entity);
        }
      }
    }
    return {
      dirtyTransformById: transformById,
      dirtyPythonLibraries: pythonLibraries,
    };
  }, [isRemoteSyncVisible, dirty]);

  return useCallback(
    (node: TreeNode): ColorName | undefined => {
      if (!isRemoteSyncVisible) {
        return undefined;
      }
      if (node.nodeType === "transform") {
        const entity =
          node.transformId != null
            ? dirtyTransformById.get(node.transformId)
            : undefined;
        return getSyncColorForEntities(entity ? [entity] : []);
      }
      if (node.nodeType === "library") {
        return getSyncColorForEntities(dirtyPythonLibraries);
      }
      if (isCollectionNode(node)) {
        const collectionIds = getDescendantCollectionIds(node);
        const entities = dirty.filter(
          (entity) =>
            (entity.collection_id != null &&
              collectionIds.has(entity.collection_id)) ||
            (entity.model === COLLECTION_MODEL && collectionIds.has(entity.id)),
        );
        return getFolderSyncColor(entities, node.collection.id as number);
      }
      return undefined;
    },
    [isRemoteSyncVisible, dirty, dirtyTransformById, dirtyPythonLibraries],
  );
}
