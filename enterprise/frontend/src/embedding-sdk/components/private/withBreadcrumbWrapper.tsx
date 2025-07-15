import type { ComponentType } from "react";

import { BreadcrumbProvider } from "./BreadcrumbProvider";
import { BreadcrumbWrapper } from "./BreadcrumbWrapper";

export const withBreadcrumbWrapper = <P extends object>(
  Component: ComponentType<P>
): ComponentType<P> => {
  const WrappedComponent = (props: P) => (
    <BreadcrumbProvider>
      <BreadcrumbWrapper>
        <Component {...props} />
      </BreadcrumbWrapper>
    </BreadcrumbProvider>
  );
  
  WrappedComponent.displayName = `withBreadcrumbWrapper(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};