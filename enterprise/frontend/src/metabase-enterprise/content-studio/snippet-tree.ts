import { useMemo } from "react";

import { useBuildSnippetTree } from "metabase/data-studio/common/hooks/use-build-snippet-tree";
import type {
  CollectionData,
  TreeItem,
} from "metabase/data-studio/common/types";
import * as Urls from "metabase/urls";
import type { CollectionId } from "metabase-types/api";

import type { ContentStudioTreeNodeItem } from "./components/ContentStudioTreeNode";
import type { ContentStudioFolderItem } from "./components/FolderContents";
import { useContentStudioScope } from "./scope";

export type ContentStudioSnippetNode = ContentStudioTreeNodeItem<TreeItem>;

type SnippetFolderItem = TreeItem & { data: CollectionData };

function isSnippetFolder(item: TreeItem): item is SnippetFolderItem {
  return item.data.model === "collection";
}

function toFolderNodes(items: TreeItem[]): ContentStudioSnippetNode[] {
  return items.filter(isSnippetFolder).map((item) => ({
    id: item.id,
    name: item.name,
    icon: item.icon,
    url: Urls.contentStudioCollection(item.data),
    children: toFolderNodes(item.children ?? []),
    data: item,
  }));
}

function toFolderItem(item: TreeItem): ContentStudioFolderItem | null {
  if (isSnippetFolder(item)) {
    return {
      id: item.id,
      name: item.name,
      icon: item.icon,
      url: Urls.contentStudioCollection(item.data),
    };
  }

  if (item.data.model === "snippet" && item.data.id != null) {
    return {
      id: item.id,
      name: item.name,
      icon: item.icon,
      url: Urls.contentStudioSnippet(item.data.id),
    };
  }

  return null;
}

function findFolder(
  items: TreeItem[],
  collectionId: CollectionId,
): TreeItem | undefined {
  for (const item of items) {
    if (isSnippetFolder(item) && item.data.id === collectionId) {
      return item;
    }
    const match = findFolder(item.children ?? [], collectionId);
    if (match) {
      return match;
    }
  }
  return undefined;
}

type ScopeSnippetTree = {
  nodes: ContentStudioSnippetNode[];
};

/**
 * The snippet folders of the branch the studio is scoped to. The tree builder
 * wraps everything in a "SQL snippets" root that the sidebar's own root row
 * already stands for, so only its contents make it into the tree.
 */
export function useScopeSnippetTree(): ScopeSnippetTree {
  const { worktreeId } = useContentStudioScope();
  const { tree } = useBuildSnippetTree({
    worktreeId: worktreeId ?? undefined,
  });

  return {
    nodes: useMemo(() => toFolderNodes(tree[0]?.children ?? []), [tree]),
  };
}

type ScopeSnippetFolder = {
  items: ContentStudioFolderItem[];
  isLoading: boolean;
};

/**
 * The sub-folders and snippets directly inside a snippet folder. A
 * `collectionId` of `null` is the root of the snippets namespace.
 */
export function useScopeSnippetFolder(
  collectionId: CollectionId | null,
): ScopeSnippetFolder {
  const { worktreeId } = useContentStudioScope();
  const { tree, isLoading, error } = useBuildSnippetTree({
    worktreeId: worktreeId ?? undefined,
  });

  const items = useMemo(() => {
    const rootItems = tree[0]?.children ?? [];
    const children =
      collectionId == null
        ? rootItems
        : (findFolder(rootItems, collectionId)?.children ?? []);

    return children
      .map(toFolderItem)
      .filter((item): item is ContentStudioFolderItem => item != null);
  }, [collectionId, tree]);

  return { items, isLoading: isLoading && error == null };
}
