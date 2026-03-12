import { useCallback } from "react";

import { useInvalidateCacheConfigsMutation } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import type { CacheableModel } from "metabase-types/api";

import { isErrorWithMessage, resolveSmoothly } from "../utils";

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
    try {
      const invalidate = invalidateCacheConfigs({
        include: "overrides",
        [targetModel]: targetId,
      }).unwrap();
      if (smooth) {
        await resolveSmoothly([invalidate]);
      } else {
        await invalidate;
      }
    } catch (e) {
      if (isErrorWithMessage(e)) {
        dispatch(
          addUndo({
            icon: "warning",
            message: e.data.message,
            toastColor: "error",
            dismissIconColor: "var(--mb-color-text-primary-inverse)",
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
