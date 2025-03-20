import { useCallback } from "react";

import { useDispatch } from "metabase/lib/redux";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import type { Undo } from "metabase-types/store/undo";

type ToastArgs = Omit<Undo, "id" | "timeoutId">;

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
