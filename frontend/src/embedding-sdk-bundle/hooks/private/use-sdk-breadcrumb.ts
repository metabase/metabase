import { useContext } from "react";

import { SdkBreadcrumbsContext } from "embedding-sdk-bundle/components/private/SdkBreadcrumbs";
import type { SdkBreadcrumbsContextType } from "embedding-sdk-bundle/types/breadcrumb";

export const useSdkBreadcrumbs = (): SdkBreadcrumbsContextType =>
  useContext(SdkBreadcrumbsContext) ?? EmptyBreadcrumbContext;

export const EmptyBreadcrumbContext: SdkBreadcrumbsContextType = {
  isBreadcrumbEnabled: false,
  breadcrumbs: [],
  currentLocation: null,
  navigateTo: () => {},
  reportLocation: () => {},
};
