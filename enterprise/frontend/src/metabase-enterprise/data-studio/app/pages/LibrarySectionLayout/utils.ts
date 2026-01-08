import { t } from "ttag";

import { isRootCollection } from "metabase/collections/utils";
import type {
  Collection,
  CollectionType,
  NativeQuerySnippet,
} from "metabase-types/api";

import type { TreeItem } from "./types";

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

function buildCollectionNode(
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
      buildCollectionNode(child, allCollections, allSnippets),
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

export function buildSnippetTree(
  snippetCollections: Collection[],
  snippets: NativeQuerySnippet[],
): TreeItem[] {
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

export function getCollection(
  rootCollection: Collection,
  type: CollectionType,
) {
  return rootCollection.children?.find(
    (collection) => collection.type === type,
  );
}

export function getWritableCollection(
  rootCollection: Collection,
  type: CollectionType,
) {
  const collection = getCollection(rootCollection, type);
  return collection?.can_write ? collection : undefined;
}
