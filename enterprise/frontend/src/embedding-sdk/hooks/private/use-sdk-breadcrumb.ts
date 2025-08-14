import { useContext } from "react";

import {
  SdkBreadcrumbContext,
  type SdkBreadcrumbContextType,
} from "embedding-sdk/components/private/Breadcrumb";
import type { SdkBreadcrumbsContextType } from "embedding-sdk/components/private/Breadcrumb/SdkBreadcrumbsProvider";

export const useSdkBreadcrumb = (): SdkBreadcrumbContextType =>
  useContext(SdkBreadcrumbContext) ?? EmptyBreadcrumbContext;

export const EmptyBreadcrumbContext: SdkBreadcrumbsContextType = {
  isBreadcrumbEnabled: false,
  breadcrumbs: [],
  currentLocation: null,
  navigateTo: () => {},
  reportLocation: () => {},
};
