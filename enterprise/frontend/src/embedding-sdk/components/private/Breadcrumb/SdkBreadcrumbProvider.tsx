import { type ReactNode, createContext, useCallback, useState } from "react";
import _ from "underscore";

export type BreadcrumbItemType =
  | "collection"
  | "dashboard"
  | "question"
  | "model"
  | "metric";

export interface BreadcrumbItem {
  id: number | string;
  name: string;
  type: BreadcrumbItemType;
  navigateTo?: () => void;
  isCurrent?: boolean;
}

export interface SdkBreadcrumbContextType {
  /** Breadcrumb is optional. */
  isBreadcrumbEnabled: boolean;

  breadcrumbs: BreadcrumbItem[];
  setBreadcrumbs: (items: BreadcrumbItem[]) => void;
  addBreadcrumb: (item: BreadcrumbItem) => void;
  updateCurrentLocation: (item: BreadcrumbItem) => void;
  navigateToBreadcrumb: (item: BreadcrumbItem) => void;
  clearBreadcrumbs: () => void;
}

export const SdkBreadcrumbContext =
  createContext<SdkBreadcrumbContextType | null>(null);

export interface SdkBreadcrumbProviderProps {
  children: ReactNode;
}

export const SdkBreadcrumbProvider = ({
  children,
}: SdkBreadcrumbProviderProps) => {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

  const addBreadcrumb = useCallback((item: BreadcrumbItem) => {
    setBreadcrumbs((prev) => {
      // Mark previous current item as not current and add action
      const updated = prev.map((breadcrumb) => ({
        ...breadcrumb,
        isCurrent: false,
        action: breadcrumb.navigateTo || (() => {}),
      }));

      // Add new item as current
      return [...updated, { ...item, isCurrent: true }];
    });
  }, []);

  const updateCurrentLocation = useCallback((item: BreadcrumbItem) => {
    setBreadcrumbs((prev) => {
      // If this is the same as the current location, don't change anything
      if (prev.length > 0 && prev[prev.length - 1].id === item.id) {
        return prev;
      }

      // If we have previous breadcrumbs, add the previous current location as a clickable breadcrumb
      if (prev.length > 0) {
        const updated = [...prev];
        const previousCurrent = updated[updated.length - 1];

        // Make the previous current location clickable
        updated[updated.length - 1] = {
          ...previousCurrent,
          isCurrent: false,
        };

        // Add the new current location
        return [...updated, { ...item, isCurrent: true }];
      }

      // First breadcrumb
      return [{ ...item, isCurrent: true }];
    });
  }, []);

  const navigateToBreadcrumb = useCallback(
    (item: BreadcrumbItem) => {
      // Find the index of the clicked breadcrumb
      const clickedIndex = breadcrumbs.findIndex(
        (breadcrumb) => breadcrumb.id === item.id,
      );

      if (clickedIndex === -1) {
        return;
      }

      // Execute the breadcrumb's action if it exists
      item?.navigateTo?.();

      // Truncate breadcrumbs to the clicked item and mark it as current
      setBreadcrumbs((prev) => {
        const truncated = prev.slice(0, clickedIndex + 1);
        return truncated.map((breadcrumb, index) => ({
          ...breadcrumb,
          isCurrent: index === clickedIndex,
          // Keep the action even when current, so it can be clicked again
        }));
      });
    },
    [breadcrumbs],
  );

  const clearBreadcrumbs = useCallback(() => {
    setBreadcrumbs([]);
  }, []);

  const value: SdkBreadcrumbContextType = {
    isBreadcrumbEnabled: true,
    breadcrumbs,
    setBreadcrumbs,
    addBreadcrumb,
    updateCurrentLocation,
    navigateToBreadcrumb,
    clearBreadcrumbs,
  };

  return (
    <SdkBreadcrumbContext.Provider value={value}>
      {children}
    </SdkBreadcrumbContext.Provider>
  );
};

export const EmptyBreadcrumbContext: SdkBreadcrumbContextType = {
  isBreadcrumbEnabled: false,
  breadcrumbs: [],
  setBreadcrumbs: _.noop,
  addBreadcrumb: _.noop,
  updateCurrentLocation: _.noop,
  navigateToBreadcrumb: _.noop,
  clearBreadcrumbs: _.noop,
};
