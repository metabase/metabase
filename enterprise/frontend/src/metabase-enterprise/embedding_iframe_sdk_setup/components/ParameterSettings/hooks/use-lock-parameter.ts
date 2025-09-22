import { useCallback } from "react";

import { useSdkIframeEmbedSetupContext } from "../../../context";

export function useLockParameter() {
  const { settings } = useSdkIframeEmbedSetupContext();

  const isLockedParameter = useCallback(
    (parameterName: string) => {
      if (settings.dashboardId || settings.questionId) {
        return (settings.lockedParameters ?? []).includes(parameterName);
      }

      return false;
    },
    [settings],
  );

  return {
    isLockedParameter,
  };
}
