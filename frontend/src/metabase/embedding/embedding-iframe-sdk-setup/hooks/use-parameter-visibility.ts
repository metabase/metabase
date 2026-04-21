import { useCallback } from "react";

import type { SdkIframeEmbedSetupContextType } from "metabase/embedding/embedding-iframe-sdk-setup/context";

type UseParameterVisibilityProps = Pick<
  SdkIframeEmbedSetupContextType,
  "settings" | "updateSettings"
>;

/**
 * Manages parameter visibility state (hidden/locked).
 * Provides checks and toggles for parameter visibility in the SDK iframe embed setup.
 */
export const useParameterVisibility = ({
  settings,
  updateSettings,
}: UseParameterVisibilityProps) => {
  const hasResource = !!settings.dashboardId || !!settings.questionId;

  const isHiddenParameter = useCallback(
    (parameterName: string) => {
      if (!hasResource) {
        return true;
      }

      const hiddenParameters =
        "hiddenParameters" in settings ? settings.hiddenParameters : undefined;
      return (hiddenParameters ?? []).includes(parameterName);
    },
    [settings, hasResource],
  );

  const isLockedParameter = useCallback(
    (parameterName: string) => {
      if (!hasResource) {
        return false;
      }

      const lockedParameters =
        "lockedParameters" in settings ? settings.lockedParameters : undefined;
      return (lockedParameters ?? []).includes(parameterName);
    },
    [settings, hasResource],
  );

  const toggleParameterVisibility = useCallback(
    (parameterName: string) => {
      if (!hasResource) {
        return;
      }

      const hiddenParameters =
        "hiddenParameters" in settings ? (settings.hiddenParameters ?? []) : [];
      const nextHiddenParameters = hiddenParameters.includes(parameterName)
        ? hiddenParameters.filter((name) => name !== parameterName)
        : [...hiddenParameters, parameterName];

      updateSettings({ hiddenParameters: nextHiddenParameters });
    },
    [settings, hasResource, updateSettings],
  );

  return {
    isHiddenParameter,
    isLockedParameter,
    toggleParameterVisibility,
  };
};
