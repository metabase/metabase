import { useDispatch } from "metabase/lib/redux";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import type { Undo } from "metabase-types/store/undo";

type ToastArgs = Omit<Undo, "id" | "timeoutId">;

// A handy convenience hook for adding toast/undo notifications
export const useToast = () => {
  const dispatch = useDispatch();
  const sendToast = (toastInfo: ToastArgs) => dispatch(addUndo(toastInfo));
  const dismissToast = (toastId: number) =>
    dispatch(dismissUndo({ undoId: toastId }));
  return [sendToast, dismissToast] as const;
};
