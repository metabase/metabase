import type { ReactNode } from "react";
import { useContext } from "react";

import { Stack } from "metabase/ui";

import { BreadcrumbContext } from "./BreadcrumbProvider";
import { SdkBreadcrumbs } from "./SdkBreadcrumbs";

export interface BreadcrumbWrapperProps {
  children: ReactNode;
}

export const BreadcrumbWrapper = ({ children }: BreadcrumbWrapperProps) => {
  const breadcrumbContext = useContext(BreadcrumbContext);

  // If there's no breadcrumb context, just render the children
  if (!breadcrumbContext) {
    return <>{children}</>;
  }

  // If there's breadcrumb context, render breadcrumbs above the children
  return (
    <Stack w="100%" h="100%" gap="sm">
      <SdkBreadcrumbs />
      {children}
    </Stack>
  );
};
