import getInitialCollectionId from "metabase/entities/collections/getInitialCollectionId";
import { useSelector } from "metabase/lib/redux";
import type { CollectionId } from "metabase-types/api";

export const useGetDefaultCollectionId = (
  sourceCollectionId?: CollectionId | null,
): CollectionId | null => {
  const initialCollectionId = useSelector(state =>
    getInitialCollectionId(state, {
      collectionId: sourceCollectionId ?? undefined,
    }),
  );

  return initialCollectionId;
};
