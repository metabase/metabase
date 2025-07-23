import { memo } from "react";

import type { MetabaseProviderProps } from "embedding-sdk/components/public/MetabaseProvider";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { ClientSideOnlyWrapper } from "embedding-sdk/sdk-wrapper/components/private/ClientSideOnlyWrapper/ClientSideOnlyWrapper";
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
  useLoadSdkBundle(props.authConfig.metabaseInstanceUrl);
  const { isLoading } = useWaitForSdkBundle();

  const reduxStore = isLoading
    ? null
    : getWindow()?.MetabaseEmbeddingSDK?.getSdkStore();
  const Component = isLoading
    ? null
    : getWindow()?.MetabaseEmbeddingSDK?.MetabaseProvider;

  return (
    <ClientSideOnlyWrapper ssrFallback={children}>
      <MetabaseProviderInner reduxStore={reduxStore} props={props}>
        {({ initialized }) =>
          initialized && Component ? (
            <Component>{children}</Component>
          ) : (
            children
          )
        }
      </MetabaseProviderInner>
    </ClientSideOnlyWrapper>
  );
});
