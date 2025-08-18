import { memo, useId, useMemo } from "react";
// eslint-disable-next-line no-external-references-for-sdk-package-code
import useDeepCompareEffect from "react-use/lib/useDeepCompareEffect";

import { ClientSideOnlyWrapper } from "embedding-sdk/sdk-package/components/private/ClientSideOnlyWrapper/ClientSideOnlyWrapper";
import { useInitializeMetabaseProviderPropsStore } from "embedding-sdk/sdk-package/hooks/private/use-initialize-metabase-provider-props-store";
import { useLoadSdkBundle } from "embedding-sdk/sdk-package/hooks/private/use-load-sdk-bundle";
import { useLogVersionInfo } from "embedding-sdk/sdk-package/hooks/private/use-log-version-info";
import { EnsureSingleInstance } from "embedding-sdk/sdk-shared/components/EnsureSingleInstance/EnsureSingleInstance";
import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import { useSdkLoadingState } from "embedding-sdk/sdk-shared/hooks/use-sdk-loading-state";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import type { SdkStore } from "embedding-sdk/store/types";
import type { MetabaseProviderProps } from "embedding-sdk/types/metabase-provider";

type MetabaseProviderInitDataWrapperProps = Pick<
  MetabaseProviderProps,
  "authConfig" | "allowConsoleLog"
> & {
  reduxStore: SdkStore;
};

/**
 * We call `use-init-data` hook to initialize the SDK with the initial data.
 * This is necessary when hooks are used before any SDK component is rendered.
 */
const MetabaseProviderInitDataWrapper = memo(function InitDataWrapper({
  authConfig,
  allowConsoleLog,
  reduxStore,
}: MetabaseProviderInitDataWrapperProps) {
  const useInitData = getWindow()?.MetabaseEmbeddingSDK?.useInitData;

  if (!reduxStore || !useInitData) {
    throw new Error("Embedding SDK Bundle is not available");
  }

  useInitData({
    reduxStore,
    authConfig,
  });

  useLogVersionInfo({ allowConsoleLog });

  return null;
});

const MetabaseProviderInner = memo(function MetabaseProviderInner(
  props: Omit<MetabaseProviderProps, "children">,
) {
  useLoadSdkBundle(props.authConfig.metabaseInstanceUrl);

  const { isLoading } = useSdkLoadingState();

  const {
    props: { reduxStore: existingStore },
  } = useMetabaseProviderPropsStore();

  // Return existing store or create a new one
  const reduxStore = useMemo(
    () =>
      isLoading
        ? null
        : (existingStore ?? getWindow()?.MetabaseEmbeddingSDK?.getSdkStore()),
    [existingStore, isLoading],
  );

  const { initialized: metabaseProviderPropsStoreInitialized } =
    useInitializeMetabaseProviderPropsStore(props, reduxStore);

  useDeepCompareEffect(
    function updateMetabaseProviderProps() {
      ensureMetabaseProviderPropsStore().setProps(props);
    },
    [props],
  );

  if (!metabaseProviderPropsStoreInitialized || !reduxStore) {
    return null;
  }

  return (
    <MetabaseProviderInitDataWrapper
      authConfig={props.authConfig}
      allowConsoleLog={props.allowConsoleLog}
      reduxStore={reduxStore}
    />
  );
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
          // eslint-disable-next-line no-literal-metabase-strings -- Warning message
          "Multiple instances of MetabaseProvider detected. Metabase Embedding SDK may work unexpectedly. Ensure only one instance of MetabaseProvider is rendered at a time."
        }
      >
        <MetabaseProviderInner {...props} />
      </EnsureSingleInstance>

      {children}
    </ClientSideOnlyWrapper>
  );
});
