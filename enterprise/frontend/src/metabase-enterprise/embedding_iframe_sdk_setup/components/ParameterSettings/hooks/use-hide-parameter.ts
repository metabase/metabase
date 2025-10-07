import { useCallback } from "react";

import type { SdkIframeEmbedSetupContextType } from "metabase-enterprise/embedding_iframe_sdk_setup/context";

export function useHideParameter({
  settings,
  updateSettings,
}: Pick<SdkIframeEmbedSetupContextType, "settings" | "updateSettings">) {
  const toggleParameterVisibility = useCallback(
    (parameterName: string) => {
      if (!settings.dashboardId && !settings.questionId) {
        return;
      }

      const hiddenParameters = settings?.hiddenParameters ?? [];

      const nextHiddenParameters = hiddenParameters.includes(parameterName)
        ? hiddenParameters.filter((name) => name !== parameterName)
        : [...hiddenParameters, parameterName];

      updateSettings({ hiddenParameters: nextHiddenParameters });
    },
    [settings, updateSettings],
  );

  const isParameterHidden = useCallback(
    (parameterName: string) => {
      if (!settings.dashboardId && !settings.questionId) {
        return true;
      }

      return (settings.hiddenParameters ?? []).includes(parameterName);
    },
    [settings],
  );

  return {
    isParameterHidden,
    toggleParameterVisibility,
  };
}
