import type React from "react";

import { GuestEmbedGuard } from "./GuestEmbedGuard";
import { PublicComponentWrapper } from "./PublicComponentWrapper";

export function withPublicComponentWrapper<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  {
    isComponentWithGuestEmbedSupport,
  }: { isComponentWithGuestEmbedSupport: boolean },
): (props: P) => React.ReactNode {
  const componentName =
    WrappedComponent.displayName || WrappedComponent.name || "Component";

  const WithPublicComponentWrapper: React.FC<P> = (props) => {
    return (
      <GuestEmbedGuard
        componentName={componentName}
        isComponentWithGuestEmbedSupport={isComponentWithGuestEmbedSupport}
      >
        <PublicComponentWrapper>
          <WrappedComponent {...props} />
        </PublicComponentWrapper>
      </GuestEmbedGuard>
    );
  };

  WithPublicComponentWrapper.displayName = `withPublicComponentWrapper(${componentName})`;

  return WithPublicComponentWrapper;
}
