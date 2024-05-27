import type { ComponentType } from "react";

import { PublicComponentWrapper } from "./PublicComponentWrapper";

export function withPublicComponentWrapper<P>(
  WrappedComponent: ComponentType<P>,
): React.FC<P> {
  const WithPublicComponentWrapper: React.FC<P> = props => {
    return (
      <PublicComponentWrapper>
        <WrappedComponent {...props} />
      </PublicComponentWrapper>
    );
  };

  WithPublicComponentWrapper.displayName = `withPublicComponentWrapper(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`;

  return WithPublicComponentWrapper;
}
