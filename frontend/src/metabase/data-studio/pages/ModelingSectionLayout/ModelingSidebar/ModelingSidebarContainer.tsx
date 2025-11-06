import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import {
  currentUserPersonalCollections,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import {
  ROOT_COLLECTION,
  buildCollectionTree,
  getCollectionIcon,
} from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";

import { ModelingSidebarView } from "./ModelingSidebarView";

interface ModelingSidebarContainerProps {
  collectionId?: string;
  snippetId?: string;
  isGlossaryActive: boolean;
}

export function ModelingSidebarContainer({
  collectionId,
  snippetId,
  isGlossaryActive,
}: ModelingSidebarContainerProps) {
  const currentUser = useSelector(getUser);

  const { data: collections = [], isLoading } = useListCollectionsTreeQuery({
    "exclude-other-user-collections": true,
    "exclude-archived": true,
  });

  const collectionTree = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    const preparedCollections = [];
    const userPersonalCollections = currentUserPersonalCollections(
      collections,
      currentUser.id,
    );
    const displayableCollections = collections.filter((collection) =>
      nonPersonalOrArchivedCollection(collection),
    );

    preparedCollections.push(...userPersonalCollections);
    preparedCollections.push(...displayableCollections);

    const tree = buildCollectionTree(preparedCollections);

    const rootIcon = getCollectionIcon(ROOT_COLLECTION);
    const root = {
      ...ROOT_COLLECTION,
      icon: rootIcon,
      children: [],
    };

    return [root, ...tree];
  }, [collections, currentUser]);

  const selectedCollectionId = useMemo(() => {
    if (!collectionId) {
      return undefined;
    }

    return collectionId === "root" ? "root" : parseInt(collectionId, 10);
  }, [collectionId]);

  const selectedSnippetId = snippetId ? parseInt(snippetId, 10) : undefined;

  if (isLoading || !currentUser) {
    return null;
  }

  return (
    <ModelingSidebarView
      collections={collectionTree}
      selectedCollectionId={selectedCollectionId}
      isGlossaryActive={isGlossaryActive}
      selectedSnippetId={selectedSnippetId}
    />
  );
}
