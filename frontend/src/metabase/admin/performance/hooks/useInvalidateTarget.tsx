import { useCallback } from "react";

import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { CacheConfigApi } from "metabase/services";
import type { CacheableModel } from "metabase-types/api";

import { resolveSmoothly, isErrorWithMessage } from "../utils";

export const useInvalidateTarget = (
  targetId: number | null,
  targetModel: CacheableModel,
  { smooth = true, shouldThrowErrors = true } = {},
) => {
  const dispatch = useDispatch();
  const invalidateTarget = useCallback(async () => {
    if (targetId === null) {
      return;
    }
    try {
      const invalidate = CacheConfigApi.invalidate(
        { include: "overrides", [targetModel]: targetId },
        { hasBody: false },
      );
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
            dismissIconColor: color("text-white"),
          }),
        );
      }
      if (shouldThrowErrors) {
        throw e;
      }
    }
  }, [dispatch, targetId, targetModel, smooth, shouldThrowErrors]);
  return invalidateTarget;
};
