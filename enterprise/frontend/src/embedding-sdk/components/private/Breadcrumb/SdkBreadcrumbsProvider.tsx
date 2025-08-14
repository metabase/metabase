import { type ReactNode, createContext, useCallback, useState } from "react";

import type { SdkCollectionId } from "embedding-sdk/types/collection";

export type BreadcrumbItemType =
  | "collection"
  | "dashboard"
  | "question"
  | "model"
  | "metric";

export interface BreadcrumbItem {
  id: number | string | SdkCollectionId;
  name: string;
  type: BreadcrumbItemType;

  /**
   * Optional callback to execute when navigating to this breadcrumb item.
   * Used for implementing "Return to" and "Back" behaviors.
   */
  onNavigate?: () => void;
}

export interface SdkBreadcrumbsContextType {
  /**
   * Whether breadcrumbs should be used.
   * This is only true when the SDK components are wrapped with BreadcrumbProvider.
   **/
  isBreadcrumbEnabled: boolean;

  /**
   * Which breadcrumbs to use.
   */
  breadcrumbs: BreadcrumbItem[];

  /**
   * The item user clicked to navigate to.
   * Components should watch this to handle navigation.
   */
  currentLocation: BreadcrumbItem | null;

  /**
   * Trigger navigation to a specific breadcrumb item.
   */
  navigateTo: (item: BreadcrumbItem) => void;

  /**
   * Report current location to the breadcrumb stack.
   */
  reportLocation: (item: BreadcrumbItem) => void;
}

export const SdkBreadcrumbsContext =
  createContext<SdkBreadcrumbsContextType | null>(null);

export interface SdkBreadcrumbsProviderProps {
  children: ReactNode;
}

export const SdkBreadcrumbsProvider = ({
  children,
}: SdkBreadcrumbsProviderProps) => {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

  const reportLocation = useCallback((item: BreadcrumbItem) => {
    setBreadcrumbs((prevBreadcrumbs) => {
      if (prevBreadcrumbs.length === 0) {
        return [item];
      }

      const lastItem = prevBreadcrumbs[prevBreadcrumbs.length - 1];

      // When navigating to a dashboard card, do not show in breadcrumbs
      // for consistency with ad-hoc questions.
      if (lastItem.type === "dashboard" && item.type === "question") {
        return prevBreadcrumbs;
      }

      // Collections should always append to build hierarchy ("Root > Analytics > Sales")
      // Only questions/dashboards/models/metrics should replace when same type
      if (item.type === "collection") {
        const breadcrumbIndex = prevBreadcrumbs.findIndex(
          (b) => b.id === item.id && b.type === item.type,
        );

        if (breadcrumbIndex !== -1) {
          return prevBreadcrumbs.slice(0, breadcrumbIndex + 1);
        }

        // Append new collection to build hierarchy
        return [...prevBreadcrumbs, item];
      }

      // Replace last questions and dashboards.
      if (lastItem.type === item.type) {
        return [...prevBreadcrumbs.slice(0, -1), item];
      }

      // Append to the navigation stack.
      return [...prevBreadcrumbs, item];
    });
  }, []);

  const navigateTo = useCallback(
    (item: BreadcrumbItem) => {
      const itemIndex = breadcrumbs.findIndex(
        (b) => b.id === item.id && b.type === item.type,
      );

      if (itemIndex !== -1) {
        const breadcrumb = breadcrumbs[itemIndex];
        breadcrumb?.onNavigate?.();

        setBreadcrumbs(breadcrumbs.slice(0, itemIndex + 1));
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
