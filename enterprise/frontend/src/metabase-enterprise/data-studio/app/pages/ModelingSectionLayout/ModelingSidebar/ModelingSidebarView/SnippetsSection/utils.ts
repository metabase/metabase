import { t } from "ttag";

import { isRootCollection } from "metabase/collections/utils";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { Collection, NativeQuerySnippet } from "metabase-types/api";

type SnippetTreeItem = NativeQuerySnippet & { model: "snippet" };
type CollectionTreeItem = Collection & { model: "collection" };

export type TreeItem = SnippetTreeItem | CollectionTreeItem;

export const isSnippetTreeItem = (item: TreeItem): item is SnippetTreeItem =>
  item.model === "snippet";

export const isCollectionTreeItem = (
  item: TreeItem,
): item is CollectionTreeItem => item.model === "collection";

function createSnippetNode(
  snippet: NativeQuerySnippet,
): ITreeNodeItem<TreeItem> {
  return {
    id: snippet.id,
    name: snippet.name,
    icon: "snippet",
    data: { ...snippet, model: "snippet" },
  };
}

function buildCollectionNode(
  collection: Collection,
  allCollections: Collection[],
  allSnippets: NativeQuerySnippet[],
): ITreeNodeItem<TreeItem> {
  const isRoot = isRootCollection(collection);
  const parentIdToMatch = isRoot ? null : collection.id;

  const childCollections = allCollections.filter(
    (c) => c.parent_id === parentIdToMatch,
  );
  const childSnippets = allSnippets.filter(
    (s) => s.collection_id === parentIdToMatch,
  );

  const children = [
    ...childCollections.map((child) =>
      buildCollectionNode(child, allCollections, allSnippets),
    ),
    ...childSnippets.map(createSnippetNode),
  ];

  return {
    id: collection.id,
    name: collection.name,
    icon: isRoot ? "snippet" : "folder",
    data: { ...collection, model: "collection" },
    children: children.length > 0 ? children : undefined,
  };
}

export function buildSnippetTree(
  snippetCollections: Collection[],
  snippets: NativeQuerySnippet[],
): ITreeNodeItem<TreeItem>[] {
  const collections = snippetCollections.filter((c) => !c.archived);
  const activeSnippets = snippets.filter((s) => !s.archived);

  const rootCollection = collections.find(isRootCollection);
  if (!rootCollection) {
    return [];
  }

  const nonRootCollections = collections.filter((c) => !isRootCollection(c));
  const rootNode = buildCollectionNode(
    rootCollection,
    nonRootCollections,
    activeSnippets,
  );

  return [{ ...rootNode, name: t`SQL snippets` }];
}
