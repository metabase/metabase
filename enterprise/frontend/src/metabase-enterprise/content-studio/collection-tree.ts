import { useMemo } from "react";

import { skipToken, useListCollectionsTreeQuery } from "metabase/api";
import {
  type CollectionTreeItem,
  buildCollectionTree,
  nonPersonalOrArchivedCollection,
} from "metabase/common/collections/utils";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

import type { ContentStudioTreeNodeItem } from "./components/ContentStudioTreeNode";
import type { ContentStudioFolderItem } from "./components/FolderContents";
import { useContentStudioScope } from "./scope";

export type ContentStudioCollectionNode =
  ContentStudioTreeNodeItem<CollectionTreeItem> & {
    data: CollectionTreeItem;
  };

function toNodes(
  collections: CollectionTreeItem[],
): ContentStudioCollectionNode[] {
  return collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    icon: collection.icon,
    url: Urls.contentStudioCollection(collection),
    children: toNodes(collection.children),
    data: collection,
  }));
}

function isVisibleInMainScope(collection: Collection) {
  return (
    nonPersonalOrArchivedCollection(collection) && !!collection.is_remote_synced
  );
}

type ScopeCollectionTree = {
  nodes: ContentStudioCollectionNode[];
  isLoading: boolean;
};

/**
 * The collections of the branch the studio is scoped to. The main branch shows
 * the subtrees that are synced to git; a checked-out branch shows everything it
 * has checked out.
 */
export function useScopeCollectionTree(): ScopeCollectionTree {
  const { worktreeId } = useContentStudioScope();
  const isMainScope = worktreeId == null;

  // `currentData` rather than `data`: the latter keeps serving the previous
  // branch's collections until the new subscription settles, which would show
  // one branch's tree under another's name.
  const { currentData: syncedCollections, isError: hasSyncedError } =
    useListCollectionsTreeQuery(
      isMainScope
        ? {
            "exclude-archived": true,
            "exclude-other-user-collections": true,
            "include-library": true,
          }
        : skipToken,
    );

  const { currentData: branchCollections, isError: hasBranchError } =
    useListCollectionsTreeQuery(
      worktreeId != null
        ? {
            "exclude-archived": true,
            "include-library": true,
            "worktree-id": worktreeId,
          }
        : skipToken,
    );

  const collections = isMainScope ? syncedCollections : branchCollections;
  const hasError = isMainScope ? hasSyncedError : hasBranchError;

  const nodes = useMemo(() => {
    const visibleCollections = (collections ?? []).filter(
      isMainScope ? isVisibleInMainScope : nonPersonalOrArchivedCollection,
    );

    return toNodes(buildCollectionTree(visibleCollections));
  }, [collections, isMainScope]);

  return {
    nodes,
    isLoading: collections === undefined && !hasError,
  };
}

type ScopeRootCollections = {
  items: ContentStudioFolderItem[];
  isLoading: boolean;
};

/** The top-level collections of the branch the studio is scoped to. */
export function useScopeRootCollections(): ScopeRootCollections {
  const { nodes, isLoading } = useScopeCollectionTree();

  const items = useMemo(
    () =>
      nodes.map((node) => ({
        id: String(node.id),
        name: node.name,
        icon: node.icon,
        url: Urls.contentStudioCollection(node.data),
      })),
    [nodes],
  );

  return { items, isLoading };
}
