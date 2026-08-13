import { useMemo, useState } from "react";

import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getCollectionIdSlugFromReference } from "embedding-sdk-bundle/store/collections";
import type { SdkCollectionId } from "embedding-sdk-bundle/types/collection";
import { skipToken, useGetCollectionQuery } from "metabase/api";
import type { CollectionId } from "metabase-types/api";

export const useCollectionData = (
  collectionId: SdkCollectionId = "personal",
  { skipCollectionFetching = false }: { skipCollectionFetching?: boolean } = {},
) => {
  const baseCollectionId = useSdkSelector((state) =>
    getCollectionIdSlugFromReference(state, collectionId),
  );

  // Internal collection state. Nullish when "personal" cannot be resolved — see
  // [[getCollectionIdSlugFromReference]].
  const [internalCollectionId, setInternalCollectionId] = useState<
    CollectionId | null | undefined
  >(baseCollectionId);

  const { isBreadcrumbEnabled: isGlobalBreadcrumbEnabled, currentLocation } =
    useSdkBreadcrumbs();

  const effectiveCollectionId = useMemo(() => {
    if (isGlobalBreadcrumbEnabled && currentLocation?.type === "collection") {
      return currentLocation.id;
    }

    return internalCollectionId;
  }, [isGlobalBreadcrumbEnabled, currentLocation, internalCollectionId]);

  const {
    data: collection,
    error: collectionLoadingError,
    isFetching: isFetchingCollection,
  } = useGetCollectionQuery(
    // To avoid `/api/collection/undefined` and 404.
    effectiveCollectionId === null ||
      effectiveCollectionId === undefined ||
      skipCollectionFetching
      ? skipToken
      : { id: effectiveCollectionId },
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
