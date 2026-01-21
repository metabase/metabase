import { useCallback } from "react";

import { useSdkDispatch, useSdkSelector } from "embedding-sdk-bundle/store";
import {
  canNavigateBack,
  getPreviousInternalNavEntry,
} from "embedding-sdk-bundle/store/selectors";

import { popSdkInternalNavigation } from "../../store/reducer";

export const useSdkInternalNavigationBack = () => {
  const dispatch = useSdkDispatch();
  const previousEntry = useSdkSelector(getPreviousInternalNavEntry);
  const canGoBack = useSdkSelector(canNavigateBack);

  const goBack = useCallback(() => {
    dispatch(popSdkInternalNavigation());
  }, [dispatch]);

  return {
    previousName: previousEntry?.name ?? null,
    canGoBack,
    goBack,
  };
};
