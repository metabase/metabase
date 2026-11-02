import {
  coerceCollectionId,
  isRootCollection,
} from "metabase/common/collections/utils";
import type { TreeItem } from "metabase/data-studio/common/types";
import {
  buildCollectionTreeChildren,
  buildCollectionTreeNode,
  createEmptyStateItem,
} from "metabase/data-studio/common/utils";
import type { Collection, NativeQuerySnippet } from "metabase-types/api";

function createSnippetNode(snippet: NativeQuerySnippet): TreeItem {
  return {
    id: `snippet:${snippet.id}`,
    name: snippet.name,
    icon: "snippet",
    model: "snippet",
    data: { ...snippet, model: "snippet" },
    updatedAt: snippet.updated_at,
  };
}

/**
 * The folders and snippets at the top of the snippets collection, an empty-state row when it holds none, or nothing
 * without a readable root.
 */
export function buildActiveSnippetTree(
  snippetCollections: Collection[],
  snippets: NativeQuerySnippet[],
  canWriteSnippets: boolean,
): TreeItem[] {
  if (!snippetCollections.some(isRootCollection)) {
    return [];
  }

  const collections = snippetCollections.filter(
    (c) => !c.archived && !isRootCollection(c),
  );
  const activeSnippets = snippets.filter((s) => !s.archived);
  const items = buildCollectionTreeChildren(
    null,
    collections,
    activeSnippets,
    createSnippetNode,
  );

  return items.length > 0
    ? items
    : [createEmptyStateItem("snippets", undefined, !canWriteSnippets)];
}

export function buildArchivedSnippetTree(
  archivedCollections: Collection[],
  archivedSnippets: NativeQuerySnippet[],
): TreeItem[] {
  const hasContent =
    archivedSnippets.length > 0 || archivedCollections.length > 0;

  if (!hasContent) {
    return [];
  }

  return [
    ...archivedCollections.map((collection) =>
      buildCollectionTreeNode(
        collection,
        archivedCollections,
        archivedSnippets,
        createSnippetNode,
      ),
    ),
    ...archivedSnippets
      .filter((snippet) => coerceCollectionId(snippet.collection_id) === "root")
      .map(createSnippetNode),
  ];
}
