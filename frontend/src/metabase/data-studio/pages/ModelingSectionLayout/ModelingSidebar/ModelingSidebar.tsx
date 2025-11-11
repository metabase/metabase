import { useMemo } from "react";

import {
  useListCollectionsTreeQuery,
  useListDatabasesQuery,
} from "metabase/api";
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
import { getHasDataAccess, getHasNativeWrite } from "metabase/selectors/data";
import { getUser } from "metabase/selectors/user";

import { ModelingSidebarView } from "./ModelingSidebarView";

interface ModelingSidebarProps {
  collectionId?: string;
  snippetId?: string;
  isGlossaryActive: boolean;
}

export function ModelingSidebar({
  collectionId,
  snippetId,
  isGlossaryActive,
}: ModelingSidebarProps) {
  const currentUser = useSelector(getUser);

  const { data: databaseData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();
  const { data: collections = [], isLoading: isLoadingCollections } =
    useListCollectionsTreeQuery({
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
      children: tree,
    };

    return [root];
  }, [collections, currentUser]);

  const selectedCollectionId = useMemo(() => {
    if (!collectionId) {
      return undefined;
    }

    return collectionId === "root" ? "root" : parseInt(collectionId, 10);
  }, [collectionId]);

  const { hasDataAccess, hasNativeWrite } = useMemo(() => {
    const databases = databaseData?.data ?? [];
    return {
      hasDataAccess: getHasDataAccess(databases),
      hasNativeWrite: getHasNativeWrite(databases),
    };
  }, [databaseData]);

  const selectedSnippetId = snippetId ? parseInt(snippetId, 10) : undefined;
  const isLoading = isLoadingDatabases || isLoadingCollections;

  if (isLoading || !currentUser) {
    return null;
  }

  return (
    <ModelingSidebarView
      collections={collectionTree}
      selectedCollectionId={selectedCollectionId}
      selectedSnippetId={selectedSnippetId}
      isGlossaryActive={isGlossaryActive}
      hasDataAccess={hasDataAccess}
      hasNativeWrite={hasNativeWrite}
    />
  );
}
