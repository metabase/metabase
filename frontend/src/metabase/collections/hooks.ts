import type { Location } from "history";
import { useMemo } from "react";

import { collectionApi } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import * as Urls from "metabase/urls/collections";
import type { Collection, CollectionId } from "metabase-types/api";

import {
  canonicalCollectionId,
  isLibraryCollection,
  isRootTrashCollection,
} from "./utils";

export type UseInitialCollectionIdProps = {
  collectionId?: Collection["id"] | null;
  location?: Location;
  params?: { collectionId?: Collection["id"]; slug?: string };
};

// Collections are loaded into two places during the entity-system → RTK migration:
// the legacy `state.entities.collections` slice via `Collections.actions.fetch`,
// `Collections.load` HOC, etc.) and the RTK Query cache (via `useGetCollectionQuery`).
// We read from both so this hook works regardless of which path loaded the collection.
//
// TODO: Once collections are exclusively RTK-loaded, the entity-state branch can be dropped.
function selectCollectionFromCache(
  state: State,
  id: Collection["id"],
): Collection | undefined {
  const fromEntities = state.entities?.collections?.[id] as
    | Collection
    | undefined;
  if (fromEntities) {
    return fromEntities;
  }
  const queryState = collectionApi.endpoints.getCollection.select({ id })(
    state,
  );
  if (queryState?.status === "fulfilled") {
    return queryState.data as Collection | undefined;
  }
  return undefined;
}

// Picks the collection ID a "create new X" form should default to, given a set of route/prop hints.
//
// TODO: Once collections are exclusively RTK-loaded, this can become a wrapper around `useGetCollectionQuery`
// with explicit loading states.
export function useInitialCollectionId({
  collectionId,
  location,
  params,
}: UseInitialCollectionIdProps = {}): CollectionId | null {
  const fromCollectionId = useSelector((state) =>
    collectionId != null
      ? selectCollectionFromCache(state, collectionId)
      : undefined,
  );

  const fromNavParam = useSelector((state) =>
    params?.collectionId != null
      ? selectCollectionFromCache(state, params.collectionId)
      : undefined,
  );

  const idFromSlug =
    params?.slug && location && Urls.isCollectionPath(location.pathname)
      ? Urls.extractCollectionId(params.slug)
      : undefined;
  const fromSlug = useSelector((state) =>
    idFromSlug != null
      ? selectCollectionFromCache(state, idFromSlug)
      : undefined,
  );

  const idFromQuery = location?.query?.collectionId as
    | Collection["id"]
    | undefined;
  const fromQuery = useSelector((state) =>
    idFromQuery != null
      ? selectCollectionFromCache(state, idFromQuery)
      : undefined,
  );

  const personalCollectionId = useSelector(getUserPersonalCollectionId);
  const rootCollection = useSelector((state) =>
    selectCollectionFromCache(state, ROOT_COLLECTION.id),
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
      if (collection.can_write && !isLibraryCollection(collection)) {
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
