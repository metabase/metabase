import { memo } from "react";
import useDeepCompareEffect from "react-use/lib/useDeepCompareEffect";

import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { ClientSideOnlyWrapper } from "embedding-sdk/sdk-wrapper/components/private/ClientSideOnlyWrapper/ClientSideOnlyWrapper";
import { useInitializeMetabaseProviderPropsStore } from "embedding-sdk/sdk-wrapper/hooks/private/use-initialize-metabase-provider-props-store";
import { useLoadSdkBundle } from "embedding-sdk/sdk-wrapper/hooks/private/use-load-sdk-bundle";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-wrapper/hooks/private/use-wait-for-sdk-bundle";
import type { MetabaseProviderProps } from "embedding-sdk/types/metabase-provider";

/**
 * We call `use-init-data` hook to initialize the SDK with the initial data.
 * This is necessary when hooks are used before any SDK component is rendered.
 */
const InitDataWrapper = memo(function InitDataWrapper(
  props: MetabaseProviderProps,
) {
  const {
    props: { initialized, reduxStore },
  } = useMetabaseProviderPropsStore();

  const useInitData = window?.MetabaseEmbeddingSDK?.useInitData;

  if (!initialized || !reduxStore || !useInitData) {
    throw new Error('Embedding SDK "useInitData" hook is not available');
  }

  useInitData({
    reduxStore: reduxStore,
    authConfig: props.authConfig,
    allowConsoleLog: props.allowConsoleLog,
  });

  return null;
});

const MetabaseProviderInner = memo(function MetabaseProviderInner(
  props: MetabaseProviderProps,
) {
  const { children, ...metabaseProviderProps } = props;

  useLoadSdkBundle(props.authConfig.metabaseInstanceUrl);
  const { isLoading } = useWaitForSdkBundle();

  const reduxStore = isLoading
    ? null
    : getWindow()?.MetabaseEmbeddingSDK?.getSdkStore();

  const { initialized } = useInitializeMetabaseProviderPropsStore(
    metabaseProviderProps,
    reduxStore,
  );

  useDeepCompareEffect(
    function updateMetabaseProviderProps() {
      ensureMetabaseProviderPropsStore().setProps(metabaseProviderProps);
    },
    [metabaseProviderProps],
  );

  return (
    <>
      {initialized && <InitDataWrapper {...props} />}

      <>{children}</>
    </>
  );
});

/**
 * A component that provides the Metabase SDK context and theme.
 *
 * @function
 * @category MetabaseProvider
 */
export const MetabaseProvider = memo(function MetabaseProvider(
  props: MetabaseProviderProps,
) {
  return (
    <ClientSideOnlyWrapper ssrFallback={props.children}>
      <MetabaseProviderInner {...props}>{props.children}</MetabaseProviderInner>
    </ClientSideOnlyWrapper>
  );
});
