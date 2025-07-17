import { useContext } from "react";

import { BreadcrumbContext, type BreadcrumbContextType } from "embedding-sdk/components/private/BreadcrumbProvider";

export const useBreadcrumbContext = (): BreadcrumbContextType => {
  const context = useContext(BreadcrumbContext);
  
  if (!context) {
    throw new Error("useBreadcrumbContext must be used within a BreadcrumbProvider");
  }
  
  return context;
};