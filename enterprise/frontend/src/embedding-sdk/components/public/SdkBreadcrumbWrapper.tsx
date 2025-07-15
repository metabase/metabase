import type { ReactNode } from "react";

import { BreadcrumbProvider } from "embedding-sdk/components/private/BreadcrumbProvider";
import { BreadcrumbWrapper } from "embedding-sdk/components/private/BreadcrumbWrapper";

export interface SdkBreadcrumbWrapperProps {
  children: ReactNode;
}

export const SdkBreadcrumbWrapper = ({ children }: SdkBreadcrumbWrapperProps) => {
  return (
    <BreadcrumbProvider>
      <BreadcrumbWrapper>
        {children}
      </BreadcrumbWrapper>
    </BreadcrumbProvider>
  );
};