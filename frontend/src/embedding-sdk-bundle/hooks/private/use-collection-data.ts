import { useMemo, useState } from "react";

import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getCollectionIdSlugFromReference } from "embedding-sdk-bundle/store/collections";
import type { SdkCollectionId } from "embedding-sdk-bundle/types/collection";
import { useGetCollectionQuery } from "metabase/api";
import type { CollectionId } from "metabase-types/api";

export const useCollectionData = (
  collectionId: SdkCollectionId = "personal",
  { skipCollectionFetching = false }: { skipCollectionFetching?: boolean } = {},
) => {
  const baseCollectionId = useSdkSelector((state) =>
    getCollectionIdSlugFromReference(state, collectionId),
  );

  // Internal collection state.
  const [internalCollectionId, setInternalCollectionId] =
    useState<CollectionId>(baseCollectionId);

  const { isBreadcrumbEnabled: isGlobalBreadcrumbEnabled, currentLocation } =
    useSdkBreadcrumbs();

  const effectiveCollectionId = useMemo(() => {
    if (isGlobalBreadcrumbEnabled && currentLocation?.type === "collection") {
      return currentLocation.id as CollectionId;
    }

    return internalCollectionId;
  }, [isGlobalBreadcrumbEnabled, currentLocation, internalCollectionId]);

  const {
    data: collection,
    error: collectionLoadingError,
    isFetching: isFetchingCollection,
  } = useGetCollectionQuery(
    { id: effectiveCollectionId },
    { skip: skipCollectionFetching },
  );

  return {
    baseCollectionId,
    internalCollectionId,
    effectiveCollectionId,
    collection,
    canWrite: collection?.can_write ?? false,
    setInternalCollectionId,
    isFetchingCollection,
    collectionLoadingError,
  };
};
