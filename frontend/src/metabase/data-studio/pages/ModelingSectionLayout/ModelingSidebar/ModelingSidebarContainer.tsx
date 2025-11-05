import type { LocationDescriptor } from "history";
import { useMemo } from "react";
import { withRouter } from "react-router";

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
  location: LocationDescriptor;
}

function ModelingSidebarContainerComponent({
  collectionId,
  location,
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

  const isGlossaryActive = useMemo(() => {
    const pathname =
      typeof location === "string" ? location : location.pathname || "";
    return pathname.includes("/modeling/glossary");
  }, [location]);

  if (isLoading || !currentUser) {
    return null;
  }

  return (
    <ModelingSidebarView
      collections={collectionTree}
      selectedCollectionId={selectedCollectionId}
      isGlossaryActive={isGlossaryActive}
    />
  );
}

export const ModelingSidebarContainer = withRouter(
  ModelingSidebarContainerComponent,
);
