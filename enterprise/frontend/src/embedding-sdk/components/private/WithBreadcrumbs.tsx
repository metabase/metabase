import type { ComponentType, ReactNode } from "react";

import { BreadcrumbProvider } from "./BreadcrumbProvider";

export interface WithBreadcrumbsProps {
  children: ReactNode;
}

export const WithBreadcrumbs = ({ children }: WithBreadcrumbsProps) => {
  return (
    <BreadcrumbProvider>
      {children}
    </BreadcrumbProvider>
  );
};

export const withBreadcrumbs = <P extends object>(
  Component: ComponentType<P>
): ComponentType<P> => {
  const WrappedComponent = (props: P) => (
    <WithBreadcrumbs>
      <Component {...props} />
    </WithBreadcrumbs>
  );
  
  WrappedComponent.displayName = `withBreadcrumbs(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
};