import { useEffect, useSyncExternalStore } from "react";
import { useMount } from "react-use";
import _ from "underscore";

import { initAuth } from "embedding-sdk-bundle/store/auth";
import { initGuestEmbed } from "embedding-sdk-bundle/store/guest-embed";
import {
  setFetchRefreshTokenFn,
  setMetabaseClientUrl,
  setMetabaseInstanceVersion,
} from "embedding-sdk-bundle/store/reducer";
import { getFetchRefreshTokenFn } from "embedding-sdk-bundle/store/selectors";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getSdkPackageVersion } from "embedding-sdk-shared/lib/get-build-info";
import { type RequestClientInfo, api } from "metabase/api/client";
import registerDashboardVisualizations from "metabase/dashboard/visualizations/register";
import { setIsDataApp } from "metabase/embedding/config";
import { setEmbedPreviewHeader } from "metabase/embedding/lib/auth/set-embed-preview-header";
import { setReactSdkEmbedReferrerHeader } from "metabase/embedding/lib/auth/set-react-sdk-embed-referrer-header";
import { setRequestClientHeaders } from "metabase/embedding/lib/auth/set-request-client-headers";
import {
  EMBEDDING_SDK_CONFIG,
  isEmbeddingEajs,
} from "metabase/embedding-sdk/config";
import { PLUGIN_API, PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { setBasename } from "metabase/utils/basename";
import { registerVisualizations } from "metabase/visualizations/register";

const sdkResponseErrorHandler = ({
  metabaseVersion,
}: {
  metabaseVersion: string | null;
}) => {
  if (metabaseVersion == null) {
    return;
  }
  // Use ensureMetabaseProviderPropsStore to access the current instance of reduxStore
  ensureMetabaseProviderPropsStore()
    .getState()
    .internalProps.reduxStore?.dispatch(
      setMetabaseInstanceVersion(metabaseVersion),
    );
};

const registerVisualizationsOnce = _.once(registerVisualizations);
const registerDashboardVisualizationsOnce = _.once(
  registerDashboardVisualizations,
);

// Install the SDK's request-client header strategy once; re-renders keep the
// first-set client (matching the previous set-once-if-unset behaviour).
const setSdkRequestClientHeadersOnce = _.once(
  (requestClient: RequestClientInfo) => {
    PLUGIN_API.onBeforeRequestHandlers.setRequestClientHeaders =
      setRequestClientHeaders(requestClient);
    PLUGIN_API.onBeforeRequestHandlers.setEmbedPreviewHeader =
      setEmbedPreviewHeader;
  },
);

interface InitDataLoaderParameters {
  reduxStore: SdkStore;
  isGuestEmbed?: boolean;
  authConfig: MetabaseAuthConfig;
  isLocalHost?: boolean;
}

export const useInitData = () => {
  const {
    state: { props, internalProps },
  } = useMetabaseProviderPropsStore();

  const reduxStore = internalProps.reduxStore;
  const authConfig = props?.authConfig;

  if (!reduxStore || !authConfig) {
    throw new Error(
      "`useInitData` hook has missing values for some required parameters",
    );
  }

  const isGuestEmbed = !!props.authConfig.isGuest;

  // `DataAppDevProvider` puts the app on the props store before rendering
  // `MetabaseProvider`. Applied here, ahead of `useInitDataInternal`, so no request
  // goes out unattributed.
  if (internalProps.dataApp) {
    setIsDataApp(internalProps.dataApp.name, {
      isDev: internalProps.dataApp.isDev,
    });
  }

  useInitDataInternal({
    reduxStore,
    isGuestEmbed,
    authConfig,
  });
};

export const useInitDataInternal = ({
  reduxStore,
  isGuestEmbed,
  authConfig,
  isLocalHost,
}: InitDataLoaderParameters) => {
  const dispatch = reduxStore.dispatch;

  const isDataUninitialized = () =>
    reduxStore.getState().sdk.initStatus.status === "uninitialized";

  const fetchRefreshTokenFnFromStore = useSyncExternalStore(
    reduxStore.subscribe,
    () => getFetchRefreshTokenFn(reduxStore.getState()),
  );

  const sdkPackageVersion = getSdkPackageVersion();

  // We have to initialize the API fields before other possible API calls
  setBasename(authConfig.metabaseInstanceUrl);

  setSdkRequestClientHeadersOnce({
    name: EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
    identifier: EMBEDDING_SDK_CONFIG.metabaseClientRequestIdentifier,
    // Note: this is *package* version, it's undefined in EAJS
    version: sdkPackageVersion,
  });

  // For the React SDK, send the host page URL as the embed referrer in a
  // header on every request. The EAJS iframe installs its own handler in
  // SdkIframeEmbedRoute.tsx using the value received via postMessage.
  if (!isEmbeddingEajs()) {
    PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.reactSdkEmbedReferrer =
      setReactSdkEmbedReferrerHeader;
  }

  // Dedupe by handler identity rather than total listener count — other code
  // can register its own `responseError` listeners without disabling ours.
  if (!api.listeners("responseError").includes(sdkResponseErrorHandler)) {
    api.on("responseError", sdkResponseErrorHandler);
  }

  useEffect(() => {
    dispatch(setMetabaseClientUrl(authConfig.metabaseInstanceUrl));
  }, [dispatch, authConfig.metabaseInstanceUrl]);

  useEffect(() => {
    if (authConfig.fetchRequestToken !== fetchRefreshTokenFnFromStore) {
      dispatch(setFetchRefreshTokenFn(authConfig.fetchRequestToken ?? null));
    }
  }, [authConfig.fetchRequestToken, fetchRefreshTokenFnFromStore, dispatch]);

  useMount(function initializeData() {
    if (!isDataUninitialized()) {
      return;
    }

    if (isGuestEmbed) {
      dispatch(initGuestEmbed(authConfig));
    } else {
      dispatch(initAuth({ ...authConfig, isLocalHost }));
    }
  });

  useMount(function registerVisualizations() {
    registerVisualizationsOnce();
    registerDashboardVisualizationsOnce();
  });
};
