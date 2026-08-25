import { useMemo, useState } from "react";

import { useSdkBreadcrumbs } from "embedding-sdk-bundle/hooks/private/use-sdk-breadcrumb";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getCollectionIdSlugFromReference } from "embedding-sdk-bundle/store/collections";
import type { SdkBrowseCollectionId } from "embedding-sdk-bundle/types/collection";
import { skipToken, useGetCollectionQuery } from "metabase/api";
import type { CollectionId } from "metabase-types/api";

export const useCollectionData = (
  collectionId: SdkBrowseCollectionId = "personal",
  { skipCollectionFetching = false }: { skipCollectionFetching?: boolean } = {},
) => {
  const baseCollectionId = useSdkSelector((state) =>
    getCollectionIdSlugFromReference(state, collectionId),
  );

  // Internal collection state. Nullish when there is no current collection, and
  // when "personal" cannot be resolved — see [[getCollectionIdSlugFromReference]].
  const [internalCollectionId, setInternalCollectionId] = useState<
    CollectionId | null | undefined
  >(baseCollectionId);

  const { isBreadcrumbEnabled: isGlobalBreadcrumbEnabled, currentLocation } =
    useSdkBreadcrumbs();

  const effectiveCollectionId = useMemo(() => {
    if (isGlobalBreadcrumbEnabled) {
      if (currentLocation?.type === "collection") {
        return currentLocation.id;
      }

      if (currentLocation?.type === "all-collections") {
        return undefined;
      }
    }

    return internalCollectionId;
  }, [isGlobalBreadcrumbEnabled, currentLocation, internalCollectionId]);

  const {
    data: fetchedCollection,
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

  // RTK Query keeps serving the last result once the argument becomes
  // `skipToken`, so going back to having no current collection would otherwise
  // inherit the collection - and its `can_write` - the user just left.
  const collection =
    effectiveCollectionId == null ? undefined : fetchedCollection;

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
