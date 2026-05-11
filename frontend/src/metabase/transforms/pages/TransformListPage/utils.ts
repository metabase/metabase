import { useMemo, useRef } from "react";
import { t } from "ttag";

import { getCollectionIcon } from "metabase/entities/collections/utils";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getLibQuery } from "metabase/transforms/utils";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Collection, CollectionId, Transform } from "metabase-types/api";

import {
  type TreeNode,
  getCollectionNodeId,
  getTransformNodeId,
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
