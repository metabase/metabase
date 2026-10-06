import { useCallback } from "react";

import { useInvalidateCacheConfigsMutation } from "metabase/api";
import { findErrorMessage } from "metabase/api/utils/errors";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import type { CacheableModel } from "metabase-types/api";

import { resolveSmoothly } from "../utils";

export const useInvalidateTarget = (
  targetId: number | null,
  targetModel: CacheableModel,
  { smooth = true, shouldThrowErrors = true } = {},
) => {
  const dispatch = useDispatch();
  const [invalidateCacheConfigs] = useInvalidateCacheConfigsMutation();
  const invalidateTarget = useCallback(async () => {
    if (targetId === null) {
      return;
    }
    const apiModel = targetModel === "metric" ? "question" : targetModel;
    try {
      const invalidate = invalidateCacheConfigs({
        include: "overrides",
        [apiModel]: targetId,
      }).unwrap();
      if (smooth) {
        await resolveSmoothly([invalidate]);
      } else {
        await invalidate;
      }
    } catch (e) {
      const message = findErrorMessage(e);
      if (message) {
        dispatch(
          addUndo({
            icon: "warning",
            message,
            toastColor: "feedback-negative",
          }),
        );
      }
      if (shouldThrowErrors) {
        throw e;
      }
    }
  }, [
    dispatch,
    targetId,
    targetModel,
    smooth,
    shouldThrowErrors,
    invalidateCacheConfigs,
  ]);
  return invalidateTarget;
};
