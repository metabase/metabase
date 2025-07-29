import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";

export const useMetadataToasts = () => {
  const [sendToast] = useToast();

  const sendSuccessToast = useCallback(
    (message: string, undo?: () => void) => {
      sendToast({
        action: undo,
        icon: "check",
        message,
      });
    },
    [sendToast],
  );

  const sendErrorToast = useCallback(
    (message: string) => {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message,
      });
    },
    [sendToast],
  );

  const sendUndoToast = useCallback(
    (error: unknown) => {
      if (error) {
        sendErrorToast(t`Couldn't undo`);
      } else {
        sendSuccessToast(t`Change undone`);
      }
    },
    [sendErrorToast, sendSuccessToast],
  );

  return { sendErrorToast, sendSuccessToast, sendUndoToast };
};
