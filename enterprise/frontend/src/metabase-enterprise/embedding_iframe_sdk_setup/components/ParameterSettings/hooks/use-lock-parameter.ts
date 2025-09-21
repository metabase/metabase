import { useSdkIframeEmbedSetupContext } from "../../../context";

export function useLockParameter() {
  const { settings } = useSdkIframeEmbedSetupContext();

  const isLockedParameter = (parameterName: string) => {
    if (settings.dashboardId || settings.questionId) {
      return (settings.lockedParameters ?? []).includes(parameterName);
    }

    return false;
  };

  return {
    isLockedParameter,
  };
}
