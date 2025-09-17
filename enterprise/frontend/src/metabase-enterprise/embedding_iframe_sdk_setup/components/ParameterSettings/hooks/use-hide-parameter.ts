import { useSdkIframeEmbedSetupContext } from "../../../context";

export function useHideParameter() {
  const { settings, updateSettings } = useSdkIframeEmbedSetupContext();

  const toggleParameterVisibility = (parameterName: string) => {
    // Dashboard parameters are shown by default and can be hidden,
    // while question parameters are always hidden in the SDK and cannot be shown.
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
    // Dashboard parameters are shown by default and can be hidden,
    // while question parameters are always hidden in the SDK and cannot be shown.
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
