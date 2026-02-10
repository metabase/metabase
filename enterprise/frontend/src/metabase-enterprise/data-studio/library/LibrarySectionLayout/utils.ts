import { t } from "ttag";

import { isRootCollection } from "metabase/collections/utils";
import * as Urls from "metabase/lib/urls";
import type {
  Collection,
  CollectionId,
  CollectionType,
  NativeQuerySnippet,
} from "metabase-types/api";

import type { LibrarySectionType, TreeItem } from "./types";

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
  canWriteSnippets: boolean,
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

  // If the root has no children (no snippets or subfolders), add an empty state
  const hasContent = activeSnippets.length > 0 || nonRootCollections.length > 0;
  const children = hasContent
    ? rootNode.children
    : [createEmptyStateItem("snippets", undefined, !canWriteSnippets)];

  return [{ ...rootNode, name: t`SQL snippets`, children }];
}

export function getAccessibleCollection(
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
  const collection = getAccessibleCollection(rootCollection, type);
  return collection?.can_write ? collection : undefined;
}

type EmptyStateConfig = {
  sectionType: LibrarySectionType;
  description: string;
  actionLabel: string;
  actionUrl?: string;
};

function getEmptyStateConfig(
  sectionType: LibrarySectionType,
): Omit<EmptyStateConfig, "sectionType" | "actionUrl"> {
  const config: Record<
    LibrarySectionType,
    Omit<EmptyStateConfig, "sectionType" | "actionUrl">
  > = {
    data: {
      description: t`Cleaned, pre-transformed data sources ready for exploring.`,
      actionLabel: t`Publish a table`,
    },
    metrics: {
      description: t`Standardized calculations with known dimensions.`,
      actionLabel: t`New metric`,
    },
    snippets: {
      description: t`Reusable bits of code that save your time.`,
      actionLabel: t`New snippet`,
    },
  };

  return config[sectionType];
}

export function createEmptyStateItem(
  sectionType: LibrarySectionType,
  collectionId?: CollectionId,
  hideAction?: boolean,
): TreeItem {
  const config = getEmptyStateConfig(sectionType);

  let actionUrl: string | undefined;
  if (sectionType === "metrics" && collectionId && !hideAction) {
    actionUrl = Urls.newDataStudioMetric({ collectionId: collectionId });
  } else if (sectionType === "snippets" && !hideAction) {
    actionUrl = Urls.newDataStudioSnippet();
  }
  // "data" section opens a modal, so no actionUrl

  return {
    id: `empty-state:${sectionType}`,
    name: "",
    icon: "empty",
    model: "empty-state",
    data: {
      model: "empty-state",
      sectionType,
      description: config.description,
      actionLabel: config.actionLabel,
      actionUrl,
    },
  };
}
