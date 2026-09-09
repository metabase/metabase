import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import { useSetting } from "metabase/settings";
import type {
  Collection,
  RemoteSyncEntity,
  WorktreeId,
} from "metabase-types/api";

import {
  type CollectionGroup,
  TRANSFORMS_ROOT_ID,
  buildNamespaceCollectionMap,
  findLibraryCollectionId,
  groupEntitiesByCollection,
} from "../displayGroups";
import { buildCollectionMap, getCollectionPathSegments } from "../utils";

type UseCollectionGroupsOptions = {
  /** Resolve collections inside a worktree instead of the main app. */
  worktreeId?: WorktreeId | null;
};

type UseCollectionGroupsResult = {
  groups: CollectionGroup[];
  collectionMap: Map<number, Collection>;
  /** True while the collection trees the grouping needs are still loading. */
  isLoading: boolean;
};

/**
 * Dirty entities arranged by the collection they live in (with the virtual Transforms root and the
 * Library standing in for content that has no real parent collection), ready to render as a
 * changes list.
 */
export function useCollectionGroups(
  entities: RemoteSyncEntity[],
  { worktreeId = null }: UseCollectionGroupsOptions = {},
): UseCollectionGroupsResult {
  const isUsingTenants = useSetting("use-tenants");
  const isTransformsSyncEnabled = useSetting("remote-sync-transforms");
  const worktreeParams =
    worktreeId != null ? { "worktree-id": worktreeId } : {};

  const { data: collectionTree = [], isLoading: isLoadingTree } =
    useListCollectionsTreeQuery({
      namespaces: [
        "",
        "analytics",
        ...(isUsingTenants ? ["shared-tenant-collection"] : []),
        ...(isTransformsSyncEnabled ? ["transforms"] : []),
      ],
      "include-library": true,
      ...worktreeParams,
    });

  const { data: snippetCollectionTree = [], isLoading: isLoadingSnippetTree } =
    useListCollectionsTreeQuery({
      namespace: "snippets",
      ...worktreeParams,
    });

  const namespaceCollectionMap = useMemo(
    () =>
      buildNamespaceCollectionMap([
        ...collectionTree,
        ...snippetCollectionTree,
      ]),
    [collectionTree, snippetCollectionTree],
  );

  const transformsRootEntity = useMemo(
    () =>
      entities.find(
        (entity) =>
          entity.model === "collection" && entity.id === TRANSFORMS_ROOT_ID,
      ),
    [entities],
  );

  const libraryCollectionId = useMemo(
    () => findLibraryCollectionId(collectionTree),
    [collectionTree],
  );

  const collectionMap = useMemo(
    () => buildCollectionMap([...collectionTree, ...snippetCollectionTree]),
    [collectionTree, snippetCollectionTree],
  );

  const groups = useMemo(
    () =>
      groupEntitiesByCollection({
        entities,
        transformsRootEntity,
        namespaceCollectionMap,
        collectionMap,
        libraryCollectionId,
        getCollectionPathSegments,
      }),
    [
      entities,
      transformsRootEntity,
      namespaceCollectionMap,
      collectionMap,
      libraryCollectionId,
    ],
  );

  return {
    groups,
    collectionMap,
    isLoading: isLoadingTree || isLoadingSnippetTree,
  };
}
