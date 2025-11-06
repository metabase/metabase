import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type { Collection, NativeQuerySnippet } from "metabase-types/api";

export function buildSnippetTree(
  snippetCollections: Collection[],
  snippets: NativeQuerySnippet[],
): ITreeNodeItem[] {
  const tree: ITreeNodeItem[] = [];

  const nonArchivedCollections = snippetCollections.filter(
    (collection) => !collection.archived,
  );
  const nonArchivedSnippets = snippets.filter((snippet) => !snippet.archived);

  nonArchivedCollections.forEach((collection) => {
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
    .filter((snippet) => !snippet.collection_id)
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
