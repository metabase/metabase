import { useEffect } from "react";
import { useUnmount } from "react-use";

import { useDispatch } from "metabase/redux";
import { setPageCollection } from "metabase/redux/app";
import type { CollectionId } from "metabase-types/api";

/**
 * Tells the app header which collection this page lives in, so it renders the
 * page's breadcrumbs next to search and the account switcher. Pass `undefined`
 * while the entity is still loading and `null` for the root collection.
 */
export const useHeaderCollection = (
  collectionId: CollectionId | null | undefined,
) => {
  const dispatch = useDispatch();

  useEffect(() => {
    if (collectionId !== undefined) {
      dispatch(setPageCollection({ collectionId }));
    }
  }, [collectionId, dispatch]);

  useUnmount(() => {
    dispatch(setPageCollection(null));
  });
};
