import { useSdkInternalNavigation } from "embedding-sdk-bundle/components/private/SdkInternalNavigationProvider";

export const useSdkInternalNavigationBack = () => {
  const { previousEntry, canGoBack, pop } = useSdkInternalNavigation();

  return {
    previousName: previousEntry?.name ?? null,
    canGoBack,
    goBack: pop,
  };
};
