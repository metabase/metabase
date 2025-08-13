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
}

export const SdkBreadcrumbsContext =
  createContext<SdkBreadcrumbsContextType | null>(null);

export function useBreadcrumbsContext() {
  return useContext(SdkBreadcrumbsContext) ?? EmptyBreadcrumbContext;
}

export interface SdkBreadcrumbsProviderProps {
  children: ReactNode;
}

export const SdkBreadcrumbsProvider = ({
  children,
}: SdkBreadcrumbsProviderProps) => {
  const value: SdkBreadcrumbsContextType = {
    isBreadcrumbEnabled: true,
    breadcrumbs: [],
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
};
