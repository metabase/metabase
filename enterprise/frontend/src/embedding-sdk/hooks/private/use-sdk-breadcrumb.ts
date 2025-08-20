import { useContext } from "react";

import { SdkBreadcrumbsContext } from "embedding-sdk/components/private/SdkBreadcrumbs";
import type { SdkBreadcrumbsContextType } from "embedding-sdk/types/breadcrumb";

export const useSdkBreadcrumbs = (): SdkBreadcrumbsContextType =>
  useContext(SdkBreadcrumbsContext) ?? EmptyBreadcrumbContext;

export const EmptyBreadcrumbContext: SdkBreadcrumbsContextType = {
  isBreadcrumbEnabled: false,
  breadcrumbs: [],
  currentLocation: null,
  navigateTo: () => {},
  reportLocation: () => {},
};
