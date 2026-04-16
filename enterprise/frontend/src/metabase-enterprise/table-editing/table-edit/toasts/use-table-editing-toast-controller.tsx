import { useMemo } from "react";

import { addUndo } from "metabase/redux/undo";
import { useDispatch } from "metabase/utils/redux";

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
