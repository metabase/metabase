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

export function useInitialCollectionId({
  collectionId,
  location,
  params,
}: UseInitialCollectionIdProps = {}): CollectionId | null {
  const personalCollectionId = useSelector(getUserPersonalCollectionId);

  const propId = collectionId ?? undefined;
  const navParamId = params?.collectionId ?? undefined;
  const urlSlugId =
    params?.slug && location && Urls.isCollectionPath(location.pathname)
      ? Urls.extractCollectionId(params.slug)
      : undefined;
  const queryParamId = location?.query?.collectionId as
    | Collection["id"]
    | undefined;

  const byPropCollection = useSelector((state) =>
    propId != null ? selectCollectionFromCache(state, propId) : undefined,
  );
  const byNavParamCollection = useSelector((state) =>
    navParamId != null
      ? selectCollectionFromCache(state, navParamId)
      : undefined,
  );
  const byUrlSlugCollection = useSelector((state) =>
    urlSlugId != null ? selectCollectionFromCache(state, urlSlugId) : undefined,
  );
  const byQueryParamCollection = useSelector((state) =>
    queryParamId != null
      ? selectCollectionFromCache(state, queryParamId)
      : undefined,
  );
  const rootCollection = useSelector((state) =>
    selectCollectionFromCache(state, "root"),
  );

  return useMemo(() => {
    const candidates: Array<
      [Collection["id"] | undefined, Collection | undefined]
    > = [
      [propId, byPropCollection],
      [navParamId, byNavParamCollection],
      [urlSlugId, byUrlSlugCollection],
      [queryParamId, byQueryParamCollection],
    ];

    for (const [id, collection] of candidates) {
      if (id == null || collection == null) {
        continue;
      }
      if (isRootTrashCollection(collection)) {
        continue;
      }
      if (collection.can_write && !isLibraryCollection(collection)) {
        return canonicalCollectionId(id);
      }
    }

    if (rootCollection?.can_write) {
      return canonicalCollectionId(ROOT_COLLECTION.id);
    }
    return canonicalCollectionId(personalCollectionId);
  }, [
    propId,
    navParamId,
    urlSlugId,
    queryParamId,
    byPropCollection,
    byNavParamCollection,
    byUrlSlugCollection,
    byQueryParamCollection,
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
