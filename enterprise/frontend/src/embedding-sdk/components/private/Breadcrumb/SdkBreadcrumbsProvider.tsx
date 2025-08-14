import { type ReactNode, createContext, useCallback, useState } from "react";

import type {
  SdkBreadcrumbItem,
  SdkBreadcrumbsContextType,
} from "embedding-sdk/types/breadcrumb";

import { updateBreadcrumbsWithItem } from "./utils/update-breadcrumbs";

export const SdkBreadcrumbsContext =
  createContext<SdkBreadcrumbsContextType | null>(null);

export interface SdkBreadcrumbsProviderProps {
  children: ReactNode;
}

export const SdkBreadcrumbsProvider = ({
  children,
}: SdkBreadcrumbsProviderProps) => {
  const [breadcrumbs, setBreadcrumbs] = useState<SdkBreadcrumbItem[]>([]);

  const reportLocation = useCallback((item: SdkBreadcrumbItem) => {
    setBreadcrumbs((prevBreadcrumbs) =>
      updateBreadcrumbsWithItem(prevBreadcrumbs, item),
    );
  }, []);

  const navigateTo = useCallback(
    (breadcrumb: SdkBreadcrumbItem) => {
      const existingIndex = breadcrumbs.findIndex(
        (b) => b.id === breadcrumb.id && b.type === breadcrumb.type,
      );

      if (existingIndex !== -1) {
        const breadcrumb = breadcrumbs[existingIndex];
        breadcrumb?.onNavigate?.();

        // Remove all breadcrumbs after this item.
        setBreadcrumbs(breadcrumbs.slice(0, existingIndex + 1));
      }
    },
    [breadcrumbs],
  );

  const currentLocation =
    breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : null;

  const value: SdkBreadcrumbsContextType = {
    isBreadcrumbEnabled: true,
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
