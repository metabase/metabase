import { type ReactNode, createContext, useCallback, useState } from "react";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { canNavigateBack } from "embedding-sdk-bundle/store/selectors";
import type {
  SdkBreadcrumbItem,
  SdkBreadcrumbsContextType,
} from "embedding-sdk-bundle/types/breadcrumb";

import {
  removeBreadcrumbsAfterItem,
  updateBreadcrumbsWithItem,
} from "./utils/update-breadcrumbs";

export const SdkBreadcrumbsContext =
  createContext<SdkBreadcrumbsContextType | null>(null);

export interface SdkBreadcrumbsProviderProps {
  children: ReactNode;
}

export const SdkBreadcrumbsProvider = ({
  children,
}: SdkBreadcrumbsProviderProps) => {
  const [breadcrumbs, setBreadcrumbs] = useState<SdkBreadcrumbItem[]>([]);
  const isInInternalNavigation = useSdkSelector(canNavigateBack);

  const reportLocation = useCallback((item: SdkBreadcrumbItem) => {
    setBreadcrumbs((prevBreadcrumbs) =>
      updateBreadcrumbsWithItem(prevBreadcrumbs, item),
    );
  }, []);

  const navigateTo = useCallback(
    (nextItem: SdkBreadcrumbItem) => {
      const nextBreadcrumbs = removeBreadcrumbsAfterItem(breadcrumbs, nextItem);

      if (nextBreadcrumbs) {
        nextItem?.onNavigate?.();
        setBreadcrumbs(nextBreadcrumbs);
      }
    },
    [breadcrumbs],
  );

  const currentLocation =
    breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : null;

  const value: SdkBreadcrumbsContextType = {
    isBreadcrumbEnabled: !isInInternalNavigation,
    breadcrumbs,
    currentLocation,
    navigateTo,
    reportLocation,
  };

  return (
    <SdkBreadcrumbsContext.Provider value={value}>
      {children}
    </SdkBreadcrumbsContext.Provider>
  );
};
