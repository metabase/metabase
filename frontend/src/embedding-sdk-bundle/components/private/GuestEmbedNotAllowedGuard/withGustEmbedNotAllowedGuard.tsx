import type React from "react";

import { GuestEmbedNotAllowedGuard } from "./GuestEmbedNotAllowedGuard";

export function withGustEmbedNotAllowedGuard<P extends object>(
  WrappedComponent: React.ComponentType<P>,
): (props: P) => React.ReactNode {
  const WithGustEmbedNotAllowedGuard: React.FC<P> = (props) => {
    return (
      <GuestEmbedNotAllowedGuard>
        <WrappedComponent {...props} />
      </GuestEmbedNotAllowedGuard>
    );
  };

  WithGustEmbedNotAllowedGuard.displayName = `withGustEmbedNotAllowedGuard(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`;

  return WithGustEmbedNotAllowedGuard;
}
