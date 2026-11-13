import type React from "react";

import type { SdkComponentName } from "embedding-sdk-bundle/analytics/component-events";
import {
  SdkComponentPerformanceBoundary,
  SdkComponentPerformanceFirstRender,
} from "embedding-sdk-bundle/analytics/sdk-first-component-performance/react";
import type { FlexibleSizeProps } from "embedding-sdk-bundle/components/private/FlexibleSizeComponent";

import { GuestEmbedGuard } from "./GuestEmbedGuard";
import { PublicComponentWrapper } from "./PublicComponentWrapper";

export function withPublicComponentWrapper<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  {
    supportsGuestEmbed,
    sdkComponentName,
  }: {
    supportsGuestEmbed: boolean;
    /** Public component name used by the `embedding_sdk_first_component_performance` event. */
    sdkComponentName?: SdkComponentName;
  },
): React.FC<P> {
  const componentName =
    WrappedComponent.displayName || WrappedComponent.name || "Component";

  const WithPublicComponentWrapper: React.FC<P> = (props) => {
    // Unjustified type cast. FIXME
    const { height, width } = props as Partial<FlexibleSizeProps>;
    const content = (
      <GuestEmbedGuard
        componentName={componentName}
        supportsGuestEmbed={supportsGuestEmbed}
      >
        <PublicComponentWrapper height={height} width={width}>
          {sdkComponentName ? (
            <SdkComponentPerformanceFirstRender>
              <WrappedComponent {...props} />
            </SdkComponentPerformanceFirstRender>
          ) : (
            <WrappedComponent {...props} />
          )}
        </PublicComponentWrapper>
      </GuestEmbedGuard>
    );

    return sdkComponentName ? (
      <SdkComponentPerformanceBoundary sdkComponentName={sdkComponentName}>
        {content}
      </SdkComponentPerformanceBoundary>
    ) : (
      content
    );
  };

  WithPublicComponentWrapper.displayName = `withPublicComponentWrapper(${componentName})`;

  return WithPublicComponentWrapper;
}
