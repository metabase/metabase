import { useMemo } from "react";

import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

import { ErrorUpdateToast } from "./ErrorUpdateToast";

export type TableEditingToastControler = {
  showSuccessToast: (message: string) => void;
};

export function useTableEditingToastController() {
  const dispatch = useDispatch();

  return useMemo(
    () => ({
      showSuccessToast(message: string) {
        dispatch(
          addUndo({
            message,
          }),
        );
      },
      showErrorToast(error: unknown, onDismiss?: () => void) {
        dispatch(
          addUndo({
            toastColor: "background-primary-inverse",
            icon: null,
            renderChildren: () => <ErrorUpdateToast error={error} />,
            timeout: null, // removes automatic toast hide
            undo: false,
            onDismiss,
          }),
        );
      },
    }),
    [dispatch],
  );
}
