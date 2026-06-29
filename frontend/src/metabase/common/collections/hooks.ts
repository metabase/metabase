import type { Location } from "history";
import { useMemo } from "react";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUser, getUserPersonalCollectionId } from "metabase/selectors/user";
import * as Urls from "metabase/urls/collections";
import type { Collection, CollectionId } from "metabase-types/api";

import { canonicalCollectionId, isRootTrashCollection } from "./utils";

export type UseInitialCollectionIdProps = {
  collectionId?: Collection["id"] | null;
  location?: Location;
  params?: { collectionId?: Collection["id"]; slug?: string };
};

const collectionIdParam = (id: Collection["id"] | undefined | null) =>
  id != null ? { id } : skipToken;

// Picks the collection ID a "create new X" form should default to, given a set of route/prop hints.
export function useInitialCollectionId({
  collectionId,
  location,
  params,
}: UseInitialCollectionIdProps = {}): CollectionId | null {
  const { data: fromCollectionId } = useGetCollectionQuery(
    collectionIdParam(collectionId),
  );
  const { data: fromNavParam } = useGetCollectionQuery(
    collectionIdParam(params?.collectionId),
  );

  const idFromSlug =
    params?.slug && location && Urls.isCollectionPath(location.pathname)
      ? Urls.extractCollectionId(params.slug)
      : undefined;
  const { data: fromSlug } = useGetCollectionQuery(
    collectionIdParam(idFromSlug),
  );

  const idFromQuery = location?.query?.collectionId as
    | Collection["id"]
    | undefined;
  const { data: fromQuery } = useGetCollectionQuery(
    collectionIdParam(idFromQuery),
  );

  const personalCollectionId = useSelector(getUserPersonalCollectionId);
  const isAuthenticated = useSelector(getUser) != null;
  const { data: rootCollection } = useGetCollectionQuery(
    isAuthenticated ? { id: ROOT_COLLECTION.id } : skipToken,
  );

  return useMemo(() => {
    const candidates = [
      fromCollectionId,
      fromNavParam,
      fromSlug,
      fromQuery,
      rootCollection,
    ];

    for (const collection of candidates) {
      if (collection == null || isRootTrashCollection(collection)) {
        continue;
      }
      if (collection.can_write) {
        return canonicalCollectionId(collection.id);
      }
    }
    return canonicalCollectionId(personalCollectionId);
  }, [
    fromCollectionId,
    fromNavParam,
    fromSlug,
    fromQuery,
    rootCollection,
    personalCollectionId,
  ]);
}

export const useOSSGetDefaultCollectionId = (
  sourceCollectionId?: CollectionId | null,
): CollectionId | null => {
  return useInitialCollectionId({
    collectionId: sourceCollectionId ?? undefined,
  });
};

export const useGetDefaultCollectionId = (
  sourceCollectionId?: CollectionId | null,
): CollectionId | null => {
  if (PLUGIN_COLLECTIONS.useGetDefaultCollectionId) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- this won't change at runtime, so it's safe
    return PLUGIN_COLLECTIONS.useGetDefaultCollectionId(sourceCollectionId);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- this won't change at runtime, so it's safe
  return useOSSGetDefaultCollectionId(sourceCollectionId);
};
