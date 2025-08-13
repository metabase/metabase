import { useContext } from "react";

import {
  EmptyBreadcrumbContext,
  SdkBreadcrumbContext,
  type SdkBreadcrumbContextType,
} from "embedding-sdk/components/private/Breadcrumb";

export const useSdkBreadcrumb = (): SdkBreadcrumbContextType => {
  const context = useContext(SdkBreadcrumbContext);

  return context ?? EmptyBreadcrumbContext;
};
