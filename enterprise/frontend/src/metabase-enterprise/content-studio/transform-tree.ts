import { useMemo } from "react";

import { useTransformTreeData } from "metabase/transforms/components/TransformTreeTable";
import {
  type TreeNode,
  isCollectionNode,
} from "metabase/transforms/pages/TransformListPage/types";
import * as Urls from "metabase/urls";
import type { CollectionId } from "metabase-types/api";

import type { ContentStudioTreeNodeItem } from "./components/ContentStudioTreeNode";
import type { ContentStudioFolderItem } from "./components/FolderContents";
import { useContentStudioScope } from "./scope";

export type ContentStudioTransformNode = ContentStudioTreeNodeItem<TreeNode>;

function toFolderNodes(nodes: TreeNode[]): ContentStudioTransformNode[] {
  return nodes.filter(isCollectionNode).map((node) => ({
    id: node.id,
    name: node.name,
    icon: node.icon,
    url: Urls.contentStudioCollection(node.collection),
    children: toFolderNodes(node.children ?? []),
    data: node,
  }));
}

function toFolderItem(node: TreeNode): ContentStudioFolderItem | null {
  if (isCollectionNode(node)) {
    return {
      id: node.id,
      name: node.name,
      icon: node.icon,
      url: Urls.contentStudioCollection(node.collection),
    };
  }

  if (node.nodeType === "transform" && node.transformId != null) {
    return {
      id: node.id,
      name: node.name,
      icon: node.icon,
      url: Urls.contentStudioTransform(node.transformId),
    };
  }

  return null;
}

function findFolder(
  nodes: TreeNode[],
  collectionId: CollectionId,
): TreeNode | undefined {
  for (const node of nodes) {
    if (isCollectionNode(node) && node.collection.id === collectionId) {
      return node;
    }
    const match = findFolder(node.children ?? [], collectionId);
    if (match) {
      return match;
    }
  }
  return undefined;
}

type ScopeTransformTree = {
  nodes: ContentStudioTransformNode[];
};

/**
 * The transform folders of the branch the studio is scoped to. Individual
 * transforms live in the folder view rather than the sidebar, and the Python
 * library is shared app-wide rather than being part of a branch.
 */
export function useScopeTransformTree(): ScopeTransformTree {
  const { worktreeId } = useContentStudioScope();
  const { nodes } = useTransformTreeData(worktreeId);

  return { nodes: useMemo(() => toFolderNodes(nodes), [nodes]) };
}

type ScopeTransformFolder = {
  items: ContentStudioFolderItem[];
  isLoading: boolean;
  error: unknown;
};

/**
 * The sub-folders and transforms directly inside a transform folder. A
 * `collectionId` of `null` is the root of the transforms namespace.
 */
export function useScopeTransformFolder(
  collectionId: CollectionId | null,
): ScopeTransformFolder {
  const { worktreeId } = useContentStudioScope();
  const { nodes, isLoading, error } = useTransformTreeData(worktreeId);

  const items = useMemo(() => {
    const children =
      collectionId == null
        ? nodes
        : (findFolder(nodes, collectionId)?.children ?? []);

    return children
      .map(toFolderItem)
      .filter((item): item is ContentStudioFolderItem => item != null);
  }, [collectionId, nodes]);

  return { items, isLoading: isLoading && error == null, error };
}
