import { t } from "ttag";

import {
  coerceCollectionId,
  isRootCollection,
} from "metabase/collections/utils";
import type { TreeItem } from "metabase/data-studio/common/types";
import { createEmptyStateItem } from "metabase/data-studio/common/utils";
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

function buildSnippetCollectionNode(
  collection: Collection,
  allCollections: Collection[],
  allSnippets: NativeQuerySnippet[],
): TreeItem {
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
      buildSnippetCollectionNode(child, allCollections, allSnippets),
    ),
    ...childSnippets.map(createSnippetNode),
  ];

  return {
    id: `collection:${collection.id}`,
    name: collection.name,
    model: "collection",
    icon: isRoot ? "snippet" : "folder",
    data: { ...collection, model: "collection" },
    children: children.length > 0 ? children : undefined,
  };
}

export function buildActiveSnippetTree(
  snippetCollections: Collection[],
  snippets: NativeQuerySnippet[],
  canWriteSnippets: boolean,
): TreeItem[] {
  const collections = snippetCollections.filter((c) => !c.archived);
  const activeSnippets = snippets.filter((s) => !s.archived);

  const rootCollection = collections.find(isRootCollection);
  if (!rootCollection) {
    return [];
  }

  const nonRootCollections = collections.filter((c) => !isRootCollection(c));
  const rootNode = buildSnippetCollectionNode(
    rootCollection,
    nonRootCollections,
    activeSnippets,
  );

  // If the root has no children (no snippets or subfolders), add an empty state
  const hasContent = activeSnippets.length > 0 || nonRootCollections.length > 0;
  const children = hasContent
    ? rootNode.children
    : [createEmptyStateItem("snippets", undefined, !canWriteSnippets)];

  return [{ ...rootNode, name: t`SQL snippets`, children }];
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
      buildSnippetCollectionNode(
        collection,
        archivedCollections,
        archivedSnippets,
      ),
    ),
    ...archivedSnippets
      .filter((snippet) => coerceCollectionId(snippet.collection_id) === "root")
      .map(createSnippetNode),
  ];
}
