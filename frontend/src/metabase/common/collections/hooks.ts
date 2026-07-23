import { useMemo } from "react";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { Location } from "metabase/router";
import { getUser, getUserPersonalCollectionId } from "metabase/selectors/user";
import * as Urls from "metabase/urls/collections";
import type { Collection, CollectionId } from "metabase-types/api";

import { canonicalCollectionId, isRootTrashCollection } from "./utils";

export type UseInitialCollectionIdProps = {
  collectionId?: Collection["id"] | null;
  location?: Location;
  params?: { collectionId?: Collection["id"]; slug?: string };
  /**
   * When `true`, skips every lookup and returns `null`. Callers that already
   * know the target collection (e.g. the SDK's `targetCollection` prop) use
   * this to avoid an unused `GET /api/collection/root` — a request tenant users
   * get a 403 for (EMB-2107).
   */
  disabled?: boolean;
};

const collectionIdParam = (id: Collection["id"] | undefined | null) =>
  id != null ? { id } : skipToken;

// Picks the collection ID a "create new X" form should default to, given a set of route/prop hints.
export function useInitialCollectionId({
  collectionId,
  location,
  params,
  disabled = false,
}: UseInitialCollectionIdProps = {}): CollectionId | null {
  const { data: fromCollectionId } = useGetCollectionQuery(
    disabled ? skipToken : collectionIdParam(collectionId),
  );
  const { data: fromNavParam } = useGetCollectionQuery(
    disabled ? skipToken : collectionIdParam(params?.collectionId),
  );

  const idFromSlug =
    params?.slug && location && Urls.isCollectionPath(location.pathname)
      ? Urls.extractCollectionId(params.slug)
      : undefined;
  const { data: fromSlug } = useGetCollectionQuery(
    disabled ? skipToken : collectionIdParam(idFromSlug),
  );

  // Unjustified type cast. FIXME
  const idFromQuery = location?.query?.collectionId as
    | Collection["id"]
    | undefined;
  const { data: fromQuery } = useGetCollectionQuery(
    disabled ? skipToken : collectionIdParam(idFromQuery),
  );

  const personalCollectionId = useSelector(getUserPersonalCollectionId);
  const isAuthenticated = useSelector(getUser) != null;
  const { data: rootCollection } = useGetCollectionQuery(
    !disabled && isAuthenticated ? { id: ROOT_COLLECTION.id } : skipToken,
  );

  return useMemo(() => {
    if (disabled) {
      return null;
    }

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
    disabled,
    fromCollectionId,
    fromNavParam,
    fromSlug,
    fromQuery,
    rootCollection,
    personalCollectionId,
  ]);
}

export type GetDefaultCollectionIdOptions = {
  /** When `true`, skips the lookup and returns `null`. Defaults to `false`. */
  disabled?: boolean;
};

export const useOSSGetDefaultCollectionId = (
  sourceCollectionId?: CollectionId | null,
  { disabled = false }: GetDefaultCollectionIdOptions = {},
): CollectionId | null => {
  return useInitialCollectionId({
    collectionId: sourceCollectionId ?? undefined,
    disabled,
  });
};

export const useGetDefaultCollectionId = (
  sourceCollectionId?: CollectionId | null,
  options: GetDefaultCollectionIdOptions = {},
): CollectionId | null => {
  if (PLUGIN_COLLECTIONS.useGetDefaultCollectionId) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- this won't change at runtime, so it's safe
    return PLUGIN_COLLECTIONS.useGetDefaultCollectionId(
      sourceCollectionId,
      options,
    );
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- this won't change at runtime, so it's safe
  return useOSSGetDefaultCollectionId(sourceCollectionId, options);
};
