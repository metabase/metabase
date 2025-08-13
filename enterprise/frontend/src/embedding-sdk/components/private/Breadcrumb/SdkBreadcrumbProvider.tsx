import { type ReactNode, createContext, useContext } from "react";

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
  /**
   * Whether breadcrumbs should be used.
   * This is only true when the SDK components are wrapped with BreadcrumbProvider.
   **/
  isBreadcrumbEnabled: boolean;

  /**
   * Which breadcrumbs to use.
   */
  breadcrumbs: BreadcrumbItem[];
}

export const SdkBreadcrumbContext =
  createContext<SdkBreadcrumbContextType | null>(null);

export function useBreadcrumbContext() {
  return useContext(SdkBreadcrumbContext) ?? EmptyBreadcrumbContext;
}

export interface SdkBreadcrumbProviderProps {
  children: ReactNode;
}

export const SdkBreadcrumbProvider = ({
  children,
}: SdkBreadcrumbProviderProps) => {
  const value: SdkBreadcrumbContextType = {
    isBreadcrumbEnabled: true,
    breadcrumbs: [],
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
};
