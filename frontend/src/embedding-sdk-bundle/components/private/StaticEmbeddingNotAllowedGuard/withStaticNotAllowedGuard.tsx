import type React from "react";

import { StaticEmbeddingNotAllowedGuard } from "./StaticEmbeddingNotAllowedGuard";

export function withStaticNotAllowedGuard<P extends object>(
  WrappedComponent: React.ComponentType<P>,
): (props: P) => React.ReactNode {
  const WithStaticEmbeddingNotAllowedGuard: React.FC<P> = (props) => {
    return (
      <StaticEmbeddingNotAllowedGuard>
        <WrappedComponent {...props} />
      </StaticEmbeddingNotAllowedGuard>
    );
  };

  WithStaticEmbeddingNotAllowedGuard.displayName = `withStaticNotAllowedGuard(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`;

  return WithStaticEmbeddingNotAllowedGuard;
}
