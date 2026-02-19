import { memo, useEffect, useId, useMemo } from "react";
import useDeepCompareEffect from "react-use/lib/useDeepCompareEffect";

import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { ClientSideOnlyWrapper } from "embedding-sdk-package/components/private/ClientSideOnlyWrapper/ClientSideOnlyWrapper";
import { useLoadSdkBundle } from "embedding-sdk-package/hooks/private/use-load-sdk-bundle";
import { EnsureSingleInstance } from "embedding-sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { useSdkLoadingState } from "embedding-sdk-shared/hooks/use-sdk-loading-state";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";

/**
 * We call `use-init-data` hook to initialize the SDK with the initial data.
 * This is necessary when hooks are used before any SDK component is rendered.
 */
const MetabaseProviderInitDataWrapper = memo(function InitDataWrapper() {
  const useInitData = getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.useInitData;
  const useLogVersionInfo =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.useLogVersionInfo;
  useInitData?.();
  useLogVersionInfo?.();

  return null;
});

const MetabaseProviderInner = memo(function MetabaseProviderInner(
  props: Omit<MetabaseProviderProps, "children">,
) {
  useLoadSdkBundle(props.authConfig.metabaseInstanceUrl);

  const { isLoading } = useSdkLoadingState();

  const {
    state: {
      internalProps: { loadingState, reduxStore: existingStore },
    },
  } = useMetabaseProviderPropsStore();

  // Return existing store or create a new one
  const reduxStore = useMemo(
    () =>
      isLoading
        ? null
        : (existingStore ??
          getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getSdkStore?.() ??
          null),
    [existingStore, isLoading],
  );

  useDeepCompareEffect(
    function setMetabaseProviderProps() {
      ensureMetabaseProviderPropsStore().setProps(props);
    },
    [props],
  );

  useEffect(function cleanup() {
    return () => {
      ensureMetabaseProviderPropsStore().cleanup();
    };
  }, []);

  useEffect(
    function initializeReduxStore() {
      if (
        reduxStore &&
        !!loadingState &&
        loadingState !== SdkLoadingState.Initialized
      ) {
        ensureMetabaseProviderPropsStore().updateInternalProps({
          reduxStore,
          loadingState: SdkLoadingState.Initialized,
        });
      }
    },
    [reduxStore, loadingState],
  );

  const metabaseProviderPropsStoreInitialized =
    loadingState === SdkLoadingState.Initialized;

  if (!metabaseProviderPropsStoreInitialized || !reduxStore) {
    return null;
  }

  return <MetabaseProviderInitDataWrapper />;
});

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
  const ensureSingleInstanceId = useId();

  return (
    <ClientSideOnlyWrapper ssrFallback={children}>
      <EnsureSingleInstance
        groupId="metabase-provider"
        instanceId={ensureSingleInstanceId}
        multipleRegisteredInstancesWarningMessage={
          // eslint-disable-next-line metabase/no-literal-metabase-strings -- Warning message
          "Multiple instances of MetabaseProvider detected. Metabase modular embedding SDK may work unexpectedly. Ensure only one instance of MetabaseProvider is rendered at a time."
        }
      >
        <MetabaseProviderInner {...props} />
      </EnsureSingleInstance>

      {children}
    </ClientSideOnlyWrapper>
  );
});
