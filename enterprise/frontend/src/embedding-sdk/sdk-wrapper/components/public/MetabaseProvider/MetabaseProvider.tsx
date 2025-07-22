import { memo, useMemo } from "react";

import type { MetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";
import { useLoadSdkBundle } from "embedding-sdk/sdk-wrapper/hooks/private/use-load-sdk-bundle";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-wrapper/hooks/private/use-wait-for-sdk-bundle";

import { MetabaseProviderInner } from "../../private/MetabaseProviderInner/MetabaseProviderInner";

/**
 * A component that provides the Metabase SDK context and theme.
 *
 * @function
 * @category MetabaseProvider
 */
export const MetabaseProvider = memo(function MetabaseProvider({
  children,
  ...props
}: MetabaseProviderProps) {
  const { isLoading } = useWaitForSdkBundle();

  const store = useMemo(
    () => (!isLoading ? window.MetabaseEmbeddingSDK?.getSdkStore() : undefined),
    [isLoading],
  );

  useLoadSdkBundle(props.authConfig.metabaseInstanceUrl);

  const Component = isLoading
    ? null
    : window.MetabaseEmbeddingSDK?.MetabaseProvider;

  return (
    <MetabaseProviderInner store={store} props={props}>
      {Component ? <Component {...props}>{children}</Component> : children}
    </MetabaseProviderInner>
  );
});
