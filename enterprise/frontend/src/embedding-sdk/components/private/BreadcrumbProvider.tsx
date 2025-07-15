import { createContext, type ReactNode, useCallback, useState } from "react";

export interface BreadcrumbItem {
  id: string;
  name: string;
  type: 'collection' | 'dashboard' | 'question' | 'drilldown';
  action?: () => void; // undefined for current location
  isCurrent?: boolean;
}

export interface BreadcrumbContextType {
  breadcrumbs: BreadcrumbItem[];
  setBreadcrumbs: (items: BreadcrumbItem[]) => void;
  addBreadcrumb: (item: BreadcrumbItem) => void;
  updateCurrentLocation: (item: BreadcrumbItem) => void;
  navigateToBreadcrumb: (id: string) => void;
  clearBreadcrumbs: () => void;
}

export const BreadcrumbContext = createContext<BreadcrumbContextType | null>(null);

export interface BreadcrumbProviderProps {
  children: ReactNode;
}

export const BreadcrumbProvider = ({ children }: BreadcrumbProviderProps) => {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

  const addBreadcrumb = useCallback((item: BreadcrumbItem) => {
    setBreadcrumbs(prev => {
      // Mark previous current item as not current and add action
      const updated = prev.map(breadcrumb => ({
        ...breadcrumb,
        isCurrent: false,
        action: breadcrumb.action || (() => {})
      }));
      
      // Add new item as current
      return [...updated, { ...item, isCurrent: true, action: undefined }];
    });
  }, []);

  const updateCurrentLocation = useCallback((item: BreadcrumbItem) => {
    setBreadcrumbs(prev => {
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
        return [...updated, { ...item, isCurrent: true, action: undefined }];
      }
      
      // First breadcrumb
      return [{ ...item, isCurrent: true, action: undefined }];
    });
  }, []);

  const navigateToBreadcrumb = useCallback((id: string) => {
    const breadcrumb = breadcrumbs.find(item => item.id === id);
    if (breadcrumb?.action) {
      breadcrumb.action();
    }
  }, [breadcrumbs]);

  const clearBreadcrumbs = useCallback(() => {
    setBreadcrumbs([]);
  }, []);

  const value: BreadcrumbContextType = {
    breadcrumbs,
    setBreadcrumbs,
    addBreadcrumb,
    updateCurrentLocation,
    navigateToBreadcrumb,
    clearBreadcrumbs,
  };

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
};