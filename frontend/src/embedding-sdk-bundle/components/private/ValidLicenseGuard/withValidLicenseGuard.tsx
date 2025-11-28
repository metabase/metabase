import type { ComponentType, FC, PropsWithChildren, ReactNode } from "react";
import { t } from "ttag";

import { SdkError } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getIsGuestEmbed } from "embedding-sdk-bundle/store/selectors";
import {
  PLUGIN_EMBEDDING_IFRAME_SDK_SETUP,
  PLUGIN_EMBEDDING_SDK,
} from "metabase/plugins";

const Guard = ({
  children,
  supportsGuestEmbed,
}: PropsWithChildren<{ supportsGuestEmbed: boolean }>) => {
  const isEmbeddingSdkFeatureEnabled = PLUGIN_EMBEDDING_SDK.isEnabled();
  const isSimpleEmbedFeatureAvailable =
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isFeatureEnabled();

  const isGuestEmbed = useSdkSelector(getIsGuestEmbed);

  // Skip license check when guest embed is currently used
  if (supportsGuestEmbed && isGuestEmbed) {
    return children;
  }

  const hasLicense =
    isEmbeddingSdkFeatureEnabled || isSimpleEmbedFeatureAvailable;

  const withLicenseCheck = hasLicense ? (
    children
  ) : (
    <SdkError
      message={t`This component cannot be used without a valid license`}
    />
  );

  return supportsGuestEmbed || isGuestEmbed ? (
    withLicenseCheck
  ) : (
    <SdkError message={t`This component does not support Guest Embed`} />
  );
};

export function withValidLicenseGuard<TProps extends object>(
  WrappedComponent: ComponentType<TProps>,
  { supportsGuestEmbed = false } = {},
): (props: TProps) => ReactNode {
  const WithValidLicenseGuard: FC<TProps> = (props) => (
    <Guard supportsGuestEmbed={supportsGuestEmbed}>
      <WrappedComponent {...props} />
    </Guard>
  );

  WithValidLicenseGuard.displayName = `withValidLicenseGuard(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`;

  return WithValidLicenseGuard;
}
