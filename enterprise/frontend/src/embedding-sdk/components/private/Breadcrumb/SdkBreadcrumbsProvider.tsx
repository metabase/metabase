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
   * The item user clicked to navigate to. Components should watch this to handle navigation.
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
      // If stack is empty, just add the item
      if (prevBreadcrumbs.length === 0) {
        return [item];
      }

      const lastItem = prevBreadcrumbs[prevBreadcrumbs.length - 1];

      // Collections should always append to build hierarchy ("Root > Analytics > Sales")
      // Only questions/dashboards/models/metrics should replace when same type
      if (item.type === "collection") {
        const existingIndex = prevBreadcrumbs.findIndex(
          (b) => b.id === item.id && b.type === item.type,
        );

        if (existingIndex !== -1) {
          return prevBreadcrumbs.slice(0, existingIndex + 1);
        }

        // Append new collection to build hierarchy
        return [...prevBreadcrumbs, item];
      }

      // For non-collection items: if same type as last item, replace it
      if (lastItem.type === item.type) {
        return [...prevBreadcrumbs.slice(0, -1), item];
      }

      // Otherwise append to stack
      return [...prevBreadcrumbs, item];
    });
  }, []);

  const navigateTo = useCallback(
    (item: BreadcrumbItem) => {
      // Find the item in the breadcrumbs
      const itemIndex = breadcrumbs.findIndex(
        (b) => b.id === item.id && b.type === item.type,
      );

      if (itemIndex !== -1) {
        // Pop the breadcrumb stack to the clicked item
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

export const EmptyBreadcrumbContext: SdkBreadcrumbsContextType = {
  isBreadcrumbEnabled: false,
  breadcrumbs: [],
  currentLocation: null,
  navigateTo: () => {},
  reportLocation: () => {},
};
