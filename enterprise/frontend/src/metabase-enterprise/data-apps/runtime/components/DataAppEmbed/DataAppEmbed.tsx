import { useMemo, useState } from "react";
import useDeepCompareEffect from "react-use/lib/useDeepCompareEffect";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { getEmbeddedAppNameFromPath } from "embedding-sdk-shared/lib/embedded-data-app-path";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getCurrentMetabaseInstanceUrl } from "embedding-sdk-shared/lib/get-current-metabase-instance-url";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";
import { PLUGIN_API } from "metabase/api/client";
import { SdkIframeError } from "metabase/embedding/embedding-iframe-sdk/components/SdkIframeError";
import { useSdkIframeEmbedEventBus } from "metabase/embedding/embedding-iframe-sdk/hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "metabase/embedding/embedding-iframe-sdk/types/embed";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";
import type { DataAppMetabaseProviderProps } from "metabase-enterprise/data-apps/sandbox/types";

import { readNameFromUrl } from "../../lib/read-name-from-url";

import { DataAppEmbedContent } from "./DataAppEmbedContent";

// Creates SDK store for embedded data apps
const store = getSdkStore();

export function DataAppEmbed() {
  const name = useMemo(() => readNameFromUrl(), []);

  const { embedSettings } = useSdkIframeEmbedEventBus({
    store,
    onSettingsChanged: installEmbedReferrerHeader,
  });

  // The bundle loads after auth and provides app settings,
  // such as app themes, to the provider above it.
  const [metabaseProviderProps, setMetabaseProviderProps] =
    useState<DataAppMetabaseProviderProps>({});

  // Auth is done on the modular embedding host app, not here.
  // DataAppEmbed does not do SSO, so we don't need the full auth config.
  const authConfig = useMemo<MetabaseAuthConfig>(() => {
    const metabaseInstanceUrl = getCurrentMetabaseInstanceUrl();

    return { metabaseInstanceUrl, isGuest: false };
  }, []);

  useDeepCompareEffect(() => {
    ensureMetabaseProviderPropsStore().setProps({
      ...metabaseProviderProps,
      authConfig,
    });

    ensureMetabaseProviderPropsStore().updateInternalProps({
      reduxStore: store,
      loadingState: SdkLoadingState.Loaded,
    });
  }, [metabaseProviderProps, authConfig]);

  if (!embedSettings) {
    return null;
  }

  // These errors cannot be localized as they are outside of the locale provider.
  // These are configuration errors, mainly intended for embedding developers.

  if (!PLUGIN_EMBEDDING_IFRAME_SDK.isEnabled()) {
    return (
      <SdkIframeError message="A valid license is required for embedding." />
    );
  }

  if (embedSettings.isGuest || embedSettings.guestEmbedProviderUri) {
    return (
      <SdkIframeError message="Guest embeds are not supported for data apps." />
    );
  }

  // TODO(DAT-18): add support for API keys for local development
  if (embedSettings.apiKey || embedSettings.useExistingUserSession) {
    return (
      <SdkIframeError message="Embedded data apps require SSO authentication." />
    );
  }

  // Parent settings must match the app loaded by this iframe.
  // This can happen if embed.js's path state is stale due to a bug.
  if (
    !name ||
    embedSettings.componentName !== "metabase-data-app" ||
    getEmbeddedAppNameFromPath(embedSettings.path) !== name
  ) {
    console.error(
      "SDK component changed or data app name does not match the path.",
    );

    return (
      <SdkIframeError message="Something went wrong. Please refresh the page and try again." />
    );
  }

  return (
    <ComponentProvider
      {...metabaseProviderProps}
      authConfig={authConfig}
      locale={embedSettings.locale}
      reduxStore={store}
      isLocalHost={embedSettings._isLocalhost}
    >
      <DataAppEmbedContent
        name={name}
        onProviderPropsLoaded={setMetabaseProviderProps}
      />
    </ComponentProvider>
  );
}

function installEmbedReferrerHeader(settings: SdkIframeEmbedSettings) {
  PLUGIN_API.onBeforeRequestHandlers.embedReferrer = async (config) => {
    if (settings._embedReferrer) {
      return {
        headers: {
          ...config?.headers,

          // eslint-disable-next-line metabase/no-literal-metabase-strings -- HTTP header name
          "X-Metabase-Embed-Referrer": settings._embedReferrer,
        },
      };
    }
  };
}
