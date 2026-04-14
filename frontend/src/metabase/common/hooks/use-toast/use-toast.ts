import { useCallback } from "react";

import type { Undo } from "metabase/redux/store/undo";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { useDispatch } from "metabase/utils/redux";

export type ToastArgs = Omit<Undo, "id" | "timeoutId">;

// A handy convenience hook for adding toast/undo notifications
export const useToast = () => {
  const dispatch = useDispatch();
  const sendToast = useCallback(
    (toastInfo: ToastArgs) => dispatch(addUndo(toastInfo)),
    [dispatch],
  );
  const dismissToast = useCallback(
    (toastId: number) => dispatch(dismissUndo({ undoId: toastId })),
    [dispatch],
  );
  return [sendToast, dismissToast] as const;
};
