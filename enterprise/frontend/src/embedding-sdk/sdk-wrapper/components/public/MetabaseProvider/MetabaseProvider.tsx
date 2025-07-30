import { memo, useEffect } from "react";

import { ensureMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { ClientSideOnlyWrapper } from "embedding-sdk/sdk-wrapper/components/private/ClientSideOnlyWrapper/ClientSideOnlyWrapper";
import { useInitializeMetabaseProviderPropsStore } from "embedding-sdk/sdk-wrapper/hooks/private/use-initialize-metabase-provider-props-store";
import { useLoadSdkBundle } from "embedding-sdk/sdk-wrapper/hooks/private/use-load-sdk-bundle";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-wrapper/hooks/private/use-wait-for-sdk-bundle";
import type { MetabaseProviderProps } from "embedding-sdk/types/metabase-provider";

const MetabaseProviderInner = (props: MetabaseProviderProps) => {
  const { children, ...metabaseProviderProps } = props;

  useLoadSdkBundle(props.authConfig.metabaseInstanceUrl);
  const { isLoading } = useWaitForSdkBundle();

  const reduxStore = isLoading
    ? null
    : getWindow()?.MetabaseEmbeddingSDK?.getSdkStore();

  useInitializeMetabaseProviderPropsStore(metabaseProviderProps, reduxStore);

  useEffect(
    function updateMetabaseProviderProps() {
      const { children, ...metabaseProviderProps } = props;

      ensureMetabaseProviderPropsStore().setProps(metabaseProviderProps);
    },
    [props],
  );

  return <>{children}</>;
};

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
  return (
    <ClientSideOnlyWrapper ssrFallback={children}>
      <MetabaseProviderInner {...props}>{children}</MetabaseProviderInner>
    </ClientSideOnlyWrapper>
  );
});
