import { useEffect, useRef } from "react";

import { Api } from "metabase/api";
import { idTag } from "metabase/api/tags";
import { useDispatch } from "metabase/utils/redux";

/**
 * Invalidates the RTK Query cache for a card when its CardEmbed node's
 * `updatedAt` attribute changes. Skips the first render so that initial
 * attribute values (loaded from the ydoc) don't trigger a refetch.
 */
export function useInvalidateCardOnStamp({
  id,
  updatedAt,
  skip,
}: {
  id: number | null | undefined;
  updatedAt: number | null | undefined;
  skip: boolean;
}) {
  const dispatch = useDispatch();
  const prevUpdatedAtRef = useRef<number | null | undefined>(updatedAt);

  useEffect(() => {
    if (prevUpdatedAtRef.current === updatedAt) {
      return;
    }
    prevUpdatedAtRef.current = updatedAt;
    if (skip || id == null) {
      return;
    }
    dispatch(Api.util.invalidateTags([idTag("card", id)]));
  }, [dispatch, id, skip, updatedAt]);
}
