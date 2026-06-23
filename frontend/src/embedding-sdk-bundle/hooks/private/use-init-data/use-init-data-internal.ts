import { useEffect } from "react";
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
import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getSdkPackageVersion } from "embedding-sdk-shared/lib/get-build-info";
import { api } from "metabase/api/client";
import registerDashboardVisualizations from "metabase/dashboard/visualizations/register";
import {
  EMBEDDING_SDK_CONFIG,
  isEmbeddingEajs,
} from "metabase/embedding-sdk/config";
import type { OnBeforeRequestHandlerConfig } from "metabase/plugins/oss/api";
import registerVisualizations from "metabase/visualizations/register";

const reactSdkEmbedReferrerHandler = async (
  config: OnBeforeRequestHandlerConfig,
): Promise<OnBeforeRequestHandlerConfig | void> => ({
  ...config,
  headers: {
    ...config.headers,
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
    "X-Metabase-Embed-Referrer": window.location.href,
  },
});

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

  const fetchRefreshTokenFnFromStore = useLazySelector(getFetchRefreshTokenFn);

  const sdkPackageVersion = getSdkPackageVersion();

  // We have to initialize the API fields before other possible API calls
  if (api.basename !== authConfig.metabaseInstanceUrl) {
    api.basename = authConfig.metabaseInstanceUrl;
  }

  if (!api.requestClient) {
    api.requestClient = {
      name: EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      // Note: this is *package* version, it's undefined in EAJS
      version: sdkPackageVersion,
    };
  }

  // For the React SDK, send the host page URL as the embed referrer in a
  // header on every request. The EAJS iframe registers its own handler in
  // SdkIframeEmbedRoute.tsx using the value received via postMessage.
  if (
    !isEmbeddingEajs() &&
    !api.beforeRequestHandlers.includes(reactSdkEmbedReferrerHandler)
  ) {
    api.beforeRequestHandlers.push(reactSdkEmbedReferrerHandler);
  }

  // Dedupe by handler identity (matches the `beforeRequestHandlers` pattern
  // above) rather than total listener count — other code can register its own
  // `responseError` listeners without disabling ours.
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
