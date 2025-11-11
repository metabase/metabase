import { isRootCollection } from "metabase/collections/utils";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { Collection, NativeQuerySnippet } from "metabase-types/api";

type SnippetTreeItem = NativeQuerySnippet & { model: "snippet" };
type CollectionTreeItem = Collection & { model: "collection" };

export type TreeItem = SnippetTreeItem | CollectionTreeItem;

export const isSnippetTreeItem = (item: TreeItem): item is SnippetTreeItem => {
  return item.model === "snippet";
};

export const isCollectionTreeItem = (
  item: TreeItem,
): item is CollectionTreeItem => {
  return item.model === "collection";
};

export function buildSnippetTree(
  snippetCollections: Collection[],
  snippets: NativeQuerySnippet[],
): ITreeNodeItem<TreeItem>[] {
  const tree: ITreeNodeItem<TreeItem>[] = [];

  const nonArchivedCollections = snippetCollections.filter(
    (collection) => !collection.archived,
  );
  const nonArchivedSnippets = snippets.filter((snippet) => !snippet.archived);

  nonArchivedCollections.forEach((collection) => {
    if (isRootCollection(collection)) {
      return;
    }

    const childSnippets = nonArchivedSnippets
      .filter((snippet) => snippet.collection_id === collection.id)
      .map((snippet) => ({
        id: snippet.id,
        name: snippet.name,
        icon: "snippet" as const,
        data: { ...snippet, model: "snippet" as const },
      }));

    tree.push({
      id: collection.id,
      name: collection.name,
      icon: "folder" as const,
      data: { ...collection, model: "collection" as const },
      children: childSnippets,
    });
  });

  nonArchivedSnippets
    .filter((snippet) => snippet.collection_id == null)
    .forEach((snippet) => {
      tree.push({
        id: snippet.id,
        name: snippet.name,
        icon: "snippet" as const,
        data: { ...snippet, model: "snippet" as const },
      });
    });

  return tree;
}
