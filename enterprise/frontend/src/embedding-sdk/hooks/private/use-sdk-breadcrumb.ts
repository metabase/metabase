import { useContext } from "react";

import {
  EmptyBreadcrumbContext,
  SdkBreadcrumbContext,
  type SdkBreadcrumbContextType,
} from "embedding-sdk/components/private/Breadcrumb";

interface BreadcrumbOptions {
  consumer?: "collection" | "dashboard" | "question";
}

export const useSdkBreadcrumb = (
  _options: BreadcrumbOptions = {},
): SdkBreadcrumbContextType => {
  const context = useContext(SdkBreadcrumbContext);

  // The breadcrumb is optional.
  // We return an empty context if the breadcrumb is not available.
  if (!context) {
    return EmptyBreadcrumbContext;
  }

  return context;
};
