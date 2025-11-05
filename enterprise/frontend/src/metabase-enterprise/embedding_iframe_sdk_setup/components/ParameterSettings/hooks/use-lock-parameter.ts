import { useCallback } from "react";

import type { SdkIframeEmbedSetupContextType } from "../../../context";

export function useLockParameter({
  settings,
}: Pick<SdkIframeEmbedSetupContextType, "settings">) {
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
