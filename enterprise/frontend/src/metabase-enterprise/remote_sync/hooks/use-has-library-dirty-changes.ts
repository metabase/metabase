import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isLibraryCollection } from "metabase/collections/utils";
import { getAllDescendantIds } from "metabase/common/components/tree/utils";
import { buildCollectionTree } from "metabase/entities/collections";

import { useGitSyncVisible } from "./use-git-sync-visible";
import { useRemoteSyncDirtyState } from "./use-remote-sync-dirty-state";

export function useHasLibraryDirtyChanges(): boolean {
  const { isVisible: isGitSyncVisible } = useGitSyncVisible();
  const { dirty, hasDirtyInCollectionTree, isDirty, hasRemovedItems } =
    useRemoteSyncDirtyState();

  const { data: collections = [] } = useListCollectionsTreeQuery(
    {
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      "include-library": true,
    },
    { skip: !isGitSyncVisible },
  );

  // Fetch snippets-namespace collections to check for dirty snippet collections
  const { data: snippetsCollections = [] } = useListCollectionsTreeQuery(
    { namespace: "snippets" },
    { skip: !isGitSyncVisible },
  );

  return useMemo(() => {
    // Always show dirty if there are removed items
    if (hasRemovedItems) {
      return true;
    }

    if (!isDirty) {
      return false;
    }

    // Check for dirty snippets or snippet collections
    const snippetsTree = buildCollectionTree(snippetsCollections);
    const snippetsCollectionIds = getAllDescendantIds(snippetsTree);
    const numericSnippetCollectionIds = new Set(
      [...snippetsCollectionIds].filter(
        (id): id is number => typeof id === "number",
      ),
    );

    const hasSnippetDirtyChanges = dirty.some((entity) => {
      if (entity.model === "nativequerysnippet") {
        return true;
      }
      if (
        entity.model === "collection" &&
        numericSnippetCollectionIds.has(entity.id)
      ) {
        return true;
      }
      return false;
    });

    if (hasSnippetDirtyChanges) {
      return true;
    }

    // Check for dirty items in the Library collection tree
    const libraryCollection = collections.find(isLibraryCollection);
    if (!libraryCollection) {
      return false;
    }

    // Build tree and get all descendant IDs (including Library itself)
    const libraryTree = buildCollectionTree([libraryCollection]);
    const libraryCollectionIds = getAllDescendantIds(libraryTree);

    // Filter to only numeric IDs for the dirty check
    const numericIds = new Set(
      [...libraryCollectionIds].filter(
        (id): id is number => typeof id === "number",
      ),
    );

    return hasDirtyInCollectionTree(numericIds);
  }, [
    collections,
    snippetsCollections,
    dirty,
    isDirty,
    hasRemovedItems,
    hasDirtyInCollectionTree,
  ]);
}
