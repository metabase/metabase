import { useSdkIframeEmbedSetupContext } from "../context";

export function useHideParameter() {
  const { settings, updateSettings } = useSdkIframeEmbedSetupContext();

  const toggleParameterVisibility = (parameterName: string) => {
    // Only dashboards supports hiding parameters
    if (!settings.dashboardId) {
      return;
    }

    const hiddenParameters = settings?.hiddenParameters ?? [];

    const nextHiddenParameters = hiddenParameters.includes(parameterName)
      ? hiddenParameters.filter((name) => name !== parameterName)
      : [...hiddenParameters, parameterName];

    updateSettings({ hiddenParameters: nextHiddenParameters });
  };

  const isParameterHidden = (parameterName: string) => {
    // Only dashboards support hiding parameters
    if (!settings.dashboardId) {
      return true;
    }

    return (settings.hiddenParameters ?? []).includes(parameterName);
  };

  return {
    isParameterHidden,
    toggleParameterVisibility,
  };
}
