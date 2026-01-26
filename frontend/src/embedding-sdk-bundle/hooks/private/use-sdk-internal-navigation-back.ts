import { useSdkInternalNavigation } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/context";

export const useSdkInternalNavigationBack = () => {
  const { previousEntry, canGoBack, pop } = useSdkInternalNavigation();

  return {
    previousName: previousEntry?.name ?? null,
    canGoBack,
    goBack: pop,
  };
};
