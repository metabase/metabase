import { useCallback } from "react";

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

  return { sendSuccessToast, sendErrorToast };
};
